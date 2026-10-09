package co.regulatedapp.app;

public class ListeningEvidenceTest {
    static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    public static void main(String[] args) {
        ListeningEvidence e = new ListeningEvidence(0);
        e.sample(0, 0, true, false, 100, 1000000);
        e.sample(5, 5000, true, false, 100, 1005000);
        check(e.seconds == 5, "actual playback earns credit");
        e.sample(5, 5000, false, false, 100, 1005000);
        e.sample(5, 15000, false, false, 100, 1015000);
        e.sample(10, 20000, false, false, 100, 1020000);
        check(e.seconds == 5, "pause/buffer/mute/error intervals cannot earn credit");
        e.sample(10, 20000, true, false, 100, 1020000);
        e.sample(11, 21000, true, false, 100, 1021000);
        e.sample(90, 22000, true, true, 100, 1022000);
        e.sample(90, 23000, true, false, 100, 1023000);
        e.sample(91, 24000, true, false, 100, 1024000);
        check(e.seconds == 7, "seek jump is fenced");
        e.sample(0, 24000, true, true, 100, 1024000);
        e.sample(0, 25000, true, false, 100, 1025000);
        e.sample(80, 105000, true, false, 100, 1105000);
        check(e.seconds == 87, "native background callback credits actual rendering");
        check(e.qualifiedAtMs != null && e.qualifiedAtMs == 1098000, "qualification time is retained at threshold");
        check(e.offsetMinutes == java.util.TimeZone.getDefault().getOffset(e.qualifiedAtMs.longValue()) / 60000, "offset retains existing minutes east schema");
        double qualified = e.qualifiedAtMs;
        e.sample(80, 105000, true, false, 100, 1105000);
        e.sample(90, 104000, true, false, 100, 1105000);
        check(e.seconds == 87 && e.qualifiedAtMs == qualified, "duplicate and backwards clock cannot credit");
        e.sample(91, 106000, true, false, 100, 1106000);
        check(e.seconds == 87, "backwards clock fences the next interval too");
        ListeningEvidence retry = new ListeningEvidence(50);
        retry.sample(0, 0, true, false, 100, 2000000);
        retry.sample(30, 30000, true, false, 100, 2030000);
        check(retry.seconds == 30 && retry.qualifiedAtMs == 2030000, "retry seeds qualification only, not cumulative evidence");
        ListeningEvidence shortTrack = new ListeningEvidence(0);
        shortTrack.sample(0, 0, true, false, 30, 2000000);
        shortTrack.sample(90, 90000, true, false, 30, 2090000);
        check(shortTrack.qualifiedAtMs == null, "short tracks never qualify");
    }
}
