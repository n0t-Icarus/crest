/* Stub yt-dlp used by tools/verify-pipeline.mjs.
 *
 * Drives the real resolveAcrossClients() ladder in server/mediaCore.mjs
 * without depending on YouTube's mood or this IP's rate-limit state. Every
 * invocation is appended to STUB_LOG so the test can assert the exact argument
 * sequence, and STUB_MODE selects the scenario.
 *
 * Modes:
 *   ok        every client succeeds
 *   climb     web_embedded is refused ("not a bot"); tv_embedded succeeds
 *   escalate  every client on the ladder is refused; tv_embedded succeeds only
 *             once the ladder has been exhausted, i.e. during the final
 *             escalation pass
 *   token     the first two attempts fail with "The page needs to be reloaded"
 *   private   every client fails with "Private video" — a per-track fault that
 *             must not be retried against every other client
 *
 * Build: cl /nologo /Fe:yt-dlp-stub.exe yt-dlp-stub.c
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int count_key(char **argv, int argc, const char *needle) {
    int hits = 0;
    for (int i = 0; i < argc; i++) {
        if (strstr(argv[i], needle) != NULL) hits++;
    }
    return hits;
}

static const char *client_of(char **argv, int argc) {
    for (int i = 0; i < argc; i++) {
        const char *p = strstr(argv[i], "youtube:player_client=");
        if (p != NULL) return p + strlen("youtube:player_client=");
    }
    return "default";
}

int main(int argc, char **argv) {
    const char *mode = getenv("STUB_MODE");
    const char *log = getenv("STUB_LOG");
    if (mode == NULL) mode = "ok";
    if (log == NULL) log = "NUL";

    const char *client = client_of(argv, argc);

    int attempt = 0;
    const char *counter = getenv("STUB_COUNTER");
    if (counter != NULL) {
        FILE *f = fopen(counter, "r");
        if (f != NULL) {
            if (fscanf(f, "%d", &attempt) != 1) attempt = 0;
            fclose(f);
        }
        attempt++;
        f = fopen(counter, "w");
        if (f != NULL) { fprintf(f, "%d", attempt); fclose(f); }
    }

    if (log != NULL) {
        FILE *f = fopen(log, "a");
        if (f != NULL) {
            fprintf(f, "attempt=%d client=%s", attempt, client);
            for (int i = 0; i < argc; i++) fprintf(f, " | %s", argv[i]);
            fprintf(f, "\n");
            fclose(f);
        }
    }

    /* The stdout below is deliberately dirty: a leading/trailing space and a
     * wrapped quote. If parseResolution does not strip it, the test fails. */
    if (strcmp(mode, "climb") == 0 && strcmp(client, "web_embedded") == 0) {
        fprintf(stderr, "ERROR: Sign in to confirm you're not a bot\n");
        return 1;
    }
    if (strcmp(mode, "escalate") == 0) {
        if (attempt < 5 || strcmp(client, "tv_embedded") != 0) {
            fprintf(stderr, "ERROR: Sign in to confirm you're not a bot\n");
            return 1;
        }
    }

    /* Two clients in the ladder need a distinct reason so the test can prove
     * classification works for the "needs a token" case too. */
    if (strcmp(mode, "private") == 0) {
        fprintf(stderr, "ERROR: [youtube] X: Private video. Sign in if you've been granted access\n");
        return 1;
    }

    if (strcmp(mode, "token") == 0) {
        if (attempt < 3) {
            fprintf(stderr, "ERROR: The page needs to be reloaded.\n");
            return 1;
        }
    }

    if (count_key(argv, argc, "--user-agent") != 1) {
        fprintf(stderr, "ERROR: stub expected exactly one --user-agent\n");
        return 2;
    }

    printf("{\"User-Agent\": \"%s\"}\n", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
    printf("  \"https://r1---sn-stub.googlevideo.com/videoplayback?expire=1&dur=185.5\"  \n");
    return 0;
}