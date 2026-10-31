package co.regulatedapp.app;

import java.util.TimeZone;

// Owned by the native player, not the WebView lifecycle. Contains no URL or identity.
final class ListeningEvidence {
    double seconds;
    Double qualifiedAtMs;
    Integer offsetMinutes;
    Double lastRenderedAtMs;
    double atMs;
    private final double priorCredit;
    private Double previousPosition, previousTime;
    private boolean previousEligible;

    ListeningEvidence(double priorCreditSeconds) {
        priorCredit = Double.isFinite(priorCreditSeconds) && priorCreditSeconds >= 0 ? priorCreditSeconds : 0;
    }

    void sample(double position, double time, boolean eligible, boolean discontinuity, double duration, double wallAtMs) {
        if (!Double.isFinite(position) || position < 0 || !Double.isFinite(time) || time < 0) return;
        double delta = previousPosition == null ? 0 : position - previousPosition;
        double elapsed = previousTime == null ? 0 : (time - previousTime) / 1000;
        boolean invalidInterval = elapsed < 0 || delta < 0 || delta > Math.max(0, elapsed) + 0.5;
        if (previousEligible && !discontinuity && delta > 0 && elapsed > 0 && delta <= elapsed + 0.5) {
            seconds += Math.min(delta, elapsed);
            lastRenderedAtMs = wallAtMs;
        }
        previousPosition = position;
        previousTime = time;
        atMs = Math.max(atMs, time);
        previousEligible = eligible && !discontinuity && !invalidInterval;
        double threshold = Math.max(60, Math.min(duration * 0.8, 600));
        if (qualifiedAtMs == null && duration >= 60 && Double.isFinite(duration)
                && seconds + priorCredit >= threshold && Double.isFinite(wallAtMs) && wallAtMs > 0) {
            qualifiedAtMs = wallAtMs - (seconds + priorCredit - threshold) * 1000;
            offsetMinutes = TimeZone.getDefault().getOffset(qualifiedAtMs.longValue()) / 60000;
        }
    }
}
