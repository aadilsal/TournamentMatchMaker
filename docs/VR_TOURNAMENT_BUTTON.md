# VR Cricket League — Tournament button integration (Quest app)

**For:** the Meta Quest / Unity team · **Status:** live in production since 6 Nov 2026 ·
**Change type:** additive — no existing endpoint changed

## What this is

The Quest app has a **Tournament** button. It should only be enabled while there is a
tournament players can actually take part in on the web platform. This endpoint tells the
headset whether that's the case right now.

A tournament counts as **live** when it is:

| Web status | Meaning | Button |
|---|---|---|
| `open` | Registration is open | **Enabled** |
| `in_progress` | Matches are being played | **Enabled** |
| draft, registration closed but not started, completed | Nothing to join or play | Disabled |

## Endpoint

```
GET https://api.tournament.pixelpaddle.com/api/v1/integrations/meta/tournaments/live
```

- No query parameters, no request body, **no `userId`** — the answer is the same for every player.
- Authentication is the same as all other Meta integration calls you already make:

| Header | Value |
|---|---|
| `x-meta-api-key` | The shared Meta API key you already use (sent separately — never commit it) |
| `x-meta-ssh-public-key` | Optional alternative — the shared SSH public key you already use |
| `Accept` | `application/json` |

### Example request

```bash
curl -s https://api.tournament.pixelpaddle.com/api/v1/integrations/meta/tournaments/live \
  -H "x-meta-api-key: <your-meta-api-key>" \
  -H "Accept: application/json"
```

### Example response — tournaments are live

```json
{
  "success": true,
  "data": {
    "hasLiveTournament": true,
    "tournaments": [
      {
        "id": "0c160535-eddf-45ab-a1f9-0040316b4f63",
        "name": "Lahore VR Championship",
        "status": "in_progress",
        "startDate": "2026-11-15T12:00:00.000Z",
        "endDate": "2026-11-22T18:00:00.000Z",
        "registrationOpen": false
      },
      {
        "id": "cbcec24d-30e1-4bd8-b4be-c37c45068d30",
        "name": "Islamabad VR League",
        "status": "open",
        "startDate": "2026-11-20T12:00:00.000Z",
        "endDate": "2026-11-27T18:00:00.000Z",
        "registrationOpen": true
      }
    ]
  },
  "error": null,
  "meta": {}
}
```

### Example response — nothing live

```json
{
  "success": true,
  "data": { "hasLiveTournament": false, "tournaments": [] },
  "error": null,
  "meta": {}
}
```

> Production currently returns `hasLiveTournament: false` because no tournament has been
> published yet. It flips to `true` as soon as an admin publishes one.

## Response fields

| Field | Type | Description |
|---|---|---|
| `hasLiveTournament` | boolean | **Drive the button from this.** `true` → enabled, `false` → disabled. |
| `tournaments` | array | The live tournaments: `in_progress` first, then by start date. At most 20. |
| `tournaments[].id` | UUID | Tournament id — the same id `GET /matches/current` returns as `tournamentId`. |
| `tournaments[].name` | string | Display name. |
| `tournaments[].status` | `"open"` \| `"in_progress"` | `open` = registration phase, `in_progress` = matches being played. |
| `tournaments[].startDate` / `endDate` | ISO-8601, UTC | Convert to the headset's local time before showing. |
| `tournaments[].registrationOpen` | boolean | `true` while a new player can still register. |

## Errors

| HTTP | `error.code` | When | What the headset should do |
|---|---|---|---|
| `401` | `UNAUTHORIZED` | Missing or wrong `x-meta-api-key` | Configuration problem — log it; keep the button disabled |
| `429` | `RATE_LIMITED` | Too many requests (see limits) | Wait for the `Retry-After` seconds; keep the last known state |
| `5xx` / timeout | — | Server or network problem | Keep the last known state; retry on the next poll |

## Recommended client behaviour

1. **When to call:** when the main menu opens, then **at most once every 60 seconds** while the
   menu is on screen. Don't poll while the player is in a match. The answer only changes when
   an admin publishes, starts or completes a tournament (or on the scheduled dates).
2. **Initial state:** show the button **disabled** until the first successful answer.
3. **On any error:** keep the **last known state** — don't flicker the button off because of
   one failed request.
4. **Optional:** use `tournaments[0].name` for a subtitle (e.g. "Lahore VR Championship — live
   now"), and `registrationOpen` to say "Registration open".
5. **After the button is pressed** nothing changes in the existing flow:
   `GET /matches/current?userId=` still tells the headset what the player can do next.

## Rate limits

- 240 requests per minute. Because this call has no `userId`, the limit is counted **per IP
  address** — all headsets behind one venue's internet connection share it.
- At one call per minute per headset, one venue connection supports ~240 headsets. Stay at or
  above the 60-second interval.

## Unity example (C#)

```csharp
using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

[Serializable] class LiveTournament { public string id, name, status, startDate, endDate; public bool registrationOpen; }
[Serializable] class LiveData { public bool hasLiveTournament; public LiveTournament[] tournaments; }
[Serializable] class LiveResponse { public bool success; public LiveData data; }

public class TournamentButtonPoller : MonoBehaviour
{
    const string Url = "https://api.tournament.pixelpaddle.com/api/v1/integrations/meta/tournaments/live";
    [SerializeField] UnityEngine.UI.Button tournamentButton;
    string apiKey; // load from your secure config, never hard-code

    bool lastKnown; // starts disabled until the first good answer

    void OnEnable()  { tournamentButton.interactable = lastKnown; StartCoroutine(Poll()); }
    void OnDisable() { StopAllCoroutines(); }

    IEnumerator Poll()
    {
        while (true)
        {
            using (var req = UnityWebRequest.Get(Url))
            {
                req.SetRequestHeader("x-meta-api-key", apiKey);
                req.SetRequestHeader("Accept", "application/json");
                req.timeout = 10;
                yield return req.SendWebRequest();

                if (req.result == UnityWebRequest.Result.Success)
                {
                    var res = JsonUtility.FromJson<LiveResponse>(req.downloadHandler.text);
                    if (res != null && res.success && res.data != null)
                        lastKnown = res.data.hasLiveTournament;
                }
                // On 401/429/5xx/timeout: keep lastKnown (no flicker).
                tournamentButton.interactable = lastKnown;
            }
            yield return new WaitForSeconds(60f); // menu-open polling interval
        }
    }
}
```

## How to test

1. Call the endpoint with your key: today it returns `hasLiveTournament: false` → button disabled.
2. Ask the Pixel Paddle team to publish a test tournament → within your next poll it returns
   `true` with that tournament → button enabled.
3. Once that tournament closes registration without starting, or is completed → `false` again → button disabled.
4. Call without the key → `401` → button stays disabled and you log a configuration error.

## Reference

Full Meta integration guide: `docs/META_INTEGRATION_API.md`, section 5.5 (this endpoint) —
including authentication (section 3), the response envelope (section 4) and the other
endpoints (current match, score submission, solo target, headset link code).

Questions or issues: contact the Pixel Paddle backend team.
