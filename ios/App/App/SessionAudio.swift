import AVFoundation
import Capacitor
import MediaPlayer

@objc(SessionAudioPlugin)
public class SessionAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SessionAudioPlugin"
    public let jsName = "SessionAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "command", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "snapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "close", returnType: CAPPluginReturnPromise)
    ]

    public override func load() {
        DispatchQueue.main.async {
            SessionAudioOwner.shared.observer = { [weak self] state in self?.notifyListeners("playback", data: state) }
        }
    }

    @objc func open(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), !token.isEmpty,
              let id = call.getString("sessionId"), !id.isEmpty,
              let source = call.getString("url"), let url = URL(string: source),
              url.scheme == "https", url.host != nil else { call.reject("Invalid session"); return }
        DispatchQueue.main.async {
            call.resolve(SessionAudioOwner.shared.open(token: token, id: id, title: call.getString("title") ?? "Regulated", url: url,
                                                     priorCreditSeconds: call.getDouble("priorCreditSeconds") ?? 0))
        }
    }

    @objc func command(_ call: CAPPluginCall) {
        guard let action = call.getString("action"), ["play", "pause", "seek"].contains(action) else {
            call.reject("Invalid command"); return
        }
        DispatchQueue.main.async {
            let owner = SessionAudioOwner.shared
            let token = call.getString("token") ?? ""
            if owner.token == token {
                switch action {
                case "play": owner.play()
                case "pause": owner.pause()
                case "seek": owner.seek(call.getDouble("position") ?? 0)
                default: break
                }
            }
            call.resolve(owner.snapshot(token))
        }
    }

    @objc func snapshot(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(SessionAudioOwner.shared.snapshot(call.getString("token") ?? "")) }
    }

    @objc func close(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(SessionAudioOwner.shared.close(call.getString("token") ?? "")) }
    }
}

class SessionBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() { bridge?.registerPluginInstance(SessionAudioPlugin()) }
}

private final class SessionAudioOwner {
    static let shared = SessionAudioOwner()
    var observer: (([String: Any]) -> Void)?
    private(set) var token = ""
    private var sessionId = "", title = "", status = "closed"
    private var revision = 0
    private var outcome: [String: Any]?
    private var player: AVPlayer?
    private var observations: [NSKeyValueObservation] = []
    private var itemNotifications: [NSObjectProtocol] = []
    private var systemNotifications: [NSObjectProtocol] = []
    private var timeObserver: Any?
    private var seekAtEnd = false
    private var seeking = false
    private var evidence = ListeningEvidence()
    private var wantsPlayback = false
    private var position = 0.0, duration = 0.0

    private init() {
        let center = NotificationCenter.default
        systemNotifications.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard let type = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  type == AVAudioSession.InterruptionType.began.rawValue else { return }
            self?.pause()
        })
        systemNotifications.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
            guard let reason = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                  reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue else { return }
            self?.pause()
        })
        systemNotifications.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in self?.fail() })
        let remote = MPRemoteCommandCenter.shared()
        remote.playCommand.addTarget { [weak self] _ in self?.remote { $0.play() } ?? .commandFailed }
        remote.pauseCommand.addTarget { [weak self] _ in self?.remote { $0.pause() } ?? .commandFailed }
        remote.togglePlayPauseCommand.addTarget { [weak self] _ in
            self?.remote { if $0.wantsPlayback { $0.pause() } else { $0.play() } } ?? .commandFailed
        }
        remote.stopCommand.addTarget { [weak self] _ in self?.remote { $0.pause() } ?? .commandFailed }
        remote.skipBackwardCommand.preferredIntervals = [15]
        remote.skipForwardCommand.preferredIntervals = [15]
        remote.skipBackwardCommand.addTarget { [weak self] _ in self?.remote { $0.sample(); $0.seek($0.position - 15) } ?? .commandFailed }
        remote.skipForwardCommand.addTarget { [weak self] _ in self?.remote { $0.sample(); $0.seek($0.position + 15) } ?? .commandFailed }
        remote.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            return self?.remote { $0.seek(event.positionTime) } ?? .commandFailed
        }
    }

    private func remote(_ work: @escaping (SessionAudioOwner) -> Void) -> MPRemoteCommandHandlerStatus {
        let perform = {
            guard self.player != nil, self.outcome == nil else { return MPRemoteCommandHandlerStatus.commandFailed }
            work(self)
            return MPRemoteCommandHandlerStatus.success
        }
        return Thread.isMainThread ? perform() : DispatchQueue.main.sync(execute: perform)
    }

    func open(token: String, id: String, title: String, url: URL, priorCreditSeconds: Double = 0) -> [String: Any] {
        releasePlayer()
        self.token = token
        sessionId = id
        self.title = title
        status = "loading"
        outcome = nil
        seekAtEnd = false
        seeking = false
        evidence = ListeningEvidence(priorCreditSeconds: priorCreditSeconds)
        wantsPlayback = false
        position = 0
        duration = 0
        let item = AVPlayerItem(url: url)
        let current = AVPlayer(playerItem: item)
        player = current
        let owns: () -> Bool = { [weak self, weak current] in self?.token == token && self?.player === current && current?.currentItem === item }
        observations.append(item.observe(\.status, options: [.new]) { [weak self] item, _ in
            DispatchQueue.main.async {
                guard owns() else { return }
                if item.status == .failed { self?.fail() } else { self?.publish() }
            }
        })
        observations.append(current.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async { if owns() { self?.publish() } }
        })
        timeObserver = current.addPeriodicTimeObserver(forInterval: CMTime(seconds: 1, preferredTimescale: 600), queue: .main) { [weak self] _ in
            if owns() { self?.publish() }
        }
        let center = NotificationCenter.default
        itemNotifications.append(center.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            guard let self = self, owns(), !self.seekAtEnd, self.wantsPlayback, self.outcome == nil else { return }
            self.outcome = ["kind": "ended", "serial": self.revision + 1]
            self.status = "ended"
            self.wantsPlayback = false
            current.pause()
            self.deactivate()
            self.publish()
        })
        itemNotifications.append(center.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            if owns() { self?.fail() }
        })
        itemNotifications.append(center.addObserver(forName: .AVPlayerItemTimeJumped, object: item, queue: .main) { [weak self] _ in
            if owns() { self?.sample(discontinuity: true) }
        })
        return snapshot(token)
    }

    func play() {
        guard let player = player, outcome == nil, !seekAtEnd else { return }
        do {
            let audio = AVAudioSession.sharedInstance()
            try audio.setCategory(.playback, mode: .spokenAudio)
            try audio.setActive(true)
            wantsPlayback = true
            player.play()
            publish()
        } catch { fail() }
    }

    func pause() {
        guard let player = player else { return }
        sample()
        wantsPlayback = false
        player.pause()
        deactivate()
        publish()
    }

    func seek(_ seconds: Double) {
        guard let player = player, outcome == nil, seconds.isFinite else { return }
        sample()
        guard duration > 0 else { return }
        seeking = true
        sample(discontinuity: true)
        seekAtEnd = seconds >= duration
        if seekAtEnd { pause() }
        let ownToken = token
        player.seek(to: CMTime(seconds: max(0, min(seconds, duration)), preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self, weak player] _ in
            DispatchQueue.main.async {
                guard let self = self, self.token == ownToken, self.player === player else { return }
                self.seeking = false
                self.sample(discontinuity: true)
                self.publish()
            }
        }
    }

    func snapshot(_ requested: String) -> [String: Any] {
        guard requested == token else { return [:] }
        sample()
        revision += 1
        return ["token": token, "sessionId": sessionId, "revision": revision, "status": status,
                "position": position, "duration": duration, "outcome": outcome as Any? ?? NSNull(),
                "evidenceSource": "native-rendered", "eligibleSeconds": evidence.seconds, "atMs": evidence.atMs,
                "qualifiedAtMs": evidence.qualifiedAtMs as Any? ?? NSNull(),
                "offsetMinutes": evidence.offsetMinutes as Any? ?? NSNull(),
                "lastRenderedAtMs": evidence.lastRenderedAtMs as Any? ?? NSNull()]
    }

    func close(_ requested: String) -> [String: Any] {
        guard requested == token else { return [:] }
        let state = snapshot(requested)
        releasePlayer()
        status = "closed"
        publish()
        return state
    }

    private func sample(discontinuity: Bool = false) {
        guard let player = player else { return }
        let seconds = player.currentTime().seconds
        let length = player.currentItem?.duration.seconds ?? 0
        position = seconds.isFinite ? max(0, seconds) : 0
        duration = length.isFinite ? max(0, length) : 0
        evidence.sample(position: position, atMs: ProcessInfo.processInfo.systemUptime * 1000,
                        eligible: player.timeControlStatus == .playing && !player.isMuted && player.volume > 0 && !seeking && outcome == nil,
                        discontinuity: discontinuity, duration: duration, wallAtMs: Date().timeIntervalSince1970 * 1000)
        if outcome == nil {
            switch player.timeControlStatus {
            case .playing: status = "playing"
            case .waitingToPlayAtSpecifiedRate: status = "buffering"
            default: status = "paused"
            }
        }
    }

    private func publish() {
        let state = snapshot(token)
        let remote = MPRemoteCommandCenter.shared()
        let available = player != nil && outcome == nil
        remote.playCommand.isEnabled = available && !seekAtEnd
        remote.pauseCommand.isEnabled = available
        remote.togglePlayPauseCommand.isEnabled = available && !seekAtEnd
        remote.stopCommand.isEnabled = available
        remote.skipBackwardCommand.isEnabled = available
        remote.skipForwardCommand.isEnabled = available
        remote.changePlaybackPositionCommand.isEnabled = available
        if player != nil {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = [
                MPMediaItemPropertyTitle: title, MPMediaItemPropertyArtist: "Regulated",
                MPMediaItemPropertyPlaybackDuration: duration,
                MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
                MPNowPlayingInfoPropertyPlaybackRate: status == "playing" ? 1.0 : 0.0
            ]
        }
        observer?(state)
    }

    private func fail() {
        guard player != nil, outcome == nil else { return }
        outcome = ["kind": "error", "code": "playback_failed"]
        status = "error"
        wantsPlayback = false
        player?.pause()
        deactivate()
        publish()
    }

    private func deactivate() {
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func releasePlayer() {
        observations.removeAll()
        itemNotifications.forEach { NotificationCenter.default.removeObserver($0) }
        itemNotifications.removeAll()
        if let timeObserver = timeObserver { player?.removeTimeObserver(timeObserver) }
        timeObserver = nil
        player?.pause()
        player?.replaceCurrentItem(with: nil)
        player = nil
        wantsPlayback = false
        deactivate()
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }
}
