# Match and round

## A round

```mermaid
flowchart LR
    D["Draw<br/>re-seed by rating,<br/>top vs bottom,<br/>odd field: lowest seed vs computer"] --> W["Play window<br/>(round length)"]
    W --> C{"Round closes<br/>deadline reached, or every match decided*"}
    C --> S["Settle unplayed matches"]
    S --> N{"Players left?"}
    N -- "2 or more" --> D
    N -- "1" --> CH([Champion])
    N -- "0" --> NC([Finished, no champion])
```

\* Round 1 with buybacks on (and not a final) always waits for its deadline, so knocked-out players
can buy back.

## A match

```mermaid
flowchart TD
    A[Match drawn: both told who they play] --> B[First player bats and sets the target]
    B --> C[Second player chases: needs target + 1]
    C --> R{Scores}
    R -- One higher --> W[Higher score wins and goes through; loser is out]
    R -- Level --> T[Tie: both replay the same match]
    T --> B
    A -. round closes first .-> Z{Who batted?}
    Z -- Only one player --> W1[That player goes through]
    Z -- Nobody --> O[Both are out]
    Z -- Still tied --> F[Whoever batted first goes through]
```

**Computer opponent:** bats after the human and finishes a few runs either side of their score
(it wins about 40% of the time); it never goes through to the next round.

**Buyback:** a player who loses in round 1 can pay before round 1 closes (never in a final) and
joins the round 2 draw. A late payment is refunded automatically.
