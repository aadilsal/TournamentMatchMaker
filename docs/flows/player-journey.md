# Player journey

```mermaid
flowchart TD
    A([Open the app]) --> B{Logged in?}
    B -- No --> C[Register or log in]
    C --> D
    B -- Yes --> D{In any open or live tournament?}
    D -- No --> S1
    D -- Yes --> S3

    subgraph Guided["Guided flow — steps cannot be skipped"]
        S1["① Choose a tournament<br/>(only ones still taking players)"] --> S2
        S2["② Where will you play?<br/>Home (headset owners) or a venue"] --> J[Join]
        J --> S3["③ My tournaments<br/>one card per tournament"]
    end

    S3 -- Join another tournament --> S1
    S3 -- Before the start --> X[Change where I play / Leave]
    X --> S2
    S3 -- Knocked out in round 1 --> BB[Buy back in] --> S3
    S3 -- Round starts --> P[Play your match in the Quest app<br/>any time before the deadline]
    P --> S3
```

**Locked in:** the menu only has *My tournaments* and *Profile*; step ② only opens for a
tournament that can still be joined; old links (venues, bookings, matches) lead back into the flow.
