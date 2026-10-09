import Foundation

// Owned by AVPlayer so rendering evidence survives a suspended WebView.
struct ListeningEvidence {
    private(set) var seconds = 0.0
    private(set) var qualifiedAtMs: Double?
    private(set) var offsetMinutes: Int?
    private(set) var lastRenderedAtMs: Double?
    private(set) var atMs = 0.0
    private let priorCredit: Double
    private var previousPosition: Double?
    private var previousTime: Double?
    private var previousEligible = false

    init(priorCreditSeconds: Double = 0) {
        priorCredit = priorCreditSeconds.isFinite && priorCreditSeconds >= 0 ? priorCreditSeconds : 0
    }

    mutating func sample(position: Double, atMs time: Double, eligible: Bool, discontinuity: Bool, duration: Double, wallAtMs: Double) {
        guard position.isFinite, position >= 0, time.isFinite, time >= 0 else { return }
        let delta = previousPosition.map { position - $0 } ?? 0
        let elapsed = previousTime.map { (time - $0) / 1000 } ?? 0
        let invalidInterval = elapsed < 0 || delta < 0 || delta > max(0, elapsed) + 0.5
        if previousEligible && !discontinuity && delta > 0 && elapsed > 0 && delta <= elapsed + 0.5 {
            seconds += min(delta, elapsed)
            lastRenderedAtMs = wallAtMs
        }
        previousPosition = position
        previousTime = time
        atMs = max(atMs, time)
        previousEligible = eligible && !discontinuity && !invalidInterval
        let threshold = max(60, min(duration * 0.8, 600))
        if qualifiedAtMs == nil && duration >= 60 && duration.isFinite
            && seconds + priorCredit >= threshold && wallAtMs.isFinite && wallAtMs > 0 {
            let time = wallAtMs - (seconds + priorCredit - threshold) * 1000
            qualifiedAtMs = time
            offsetMinutes = TimeZone.current.secondsFromGMT(for: Date(timeIntervalSince1970: time / 1000)) / 60
        }
    }
}
