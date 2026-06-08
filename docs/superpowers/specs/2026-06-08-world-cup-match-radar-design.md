# World Cup Match Radar Design

## Goal

Build a World Cup styled football match radar for daily football betting analysis. The first version is a project template with mock data, a live-feeling dashboard, prediction cards, daily parlay recommendations, probability tracking, and a clear seam for future data ingestion.

The product must present predictions as model estimates, not guarantees. Every recommendation includes confidence, risk, and a short reason.

## Visual Direction

The interface should feel like a World Cup broadcast analysis desk, not a generic betting page.

Style rules:

- Dark football-pitch base with field lines and stadium lighting accents.
- Gold trophy-inspired highlights for premium picks and daily focus cards.
- Red and blue matchup accents for home and away teams.
- Compact sports data cards with clear hierarchy.
- Live labels, countdowns, score chips, and probability rings.
- No marketing landing page. The first screen is the usable dashboard.

HyperFrames can be used later for cinematic motion studies, animated intro clips, social recap videos, or broadcast-style scene transitions. The main application should remain a normal web dashboard first.

## Main Layout

The first screen has five regions.

### Top Navigation

Shows:

- Product name: World Cup Match Radar
- Today / Tomorrow filters
- Match count
- Data refresh time
- Live status indicator

### Left Match Rail

Shows near-two-day football matches.

Each match row contains:

- Match ID
- Kickoff time
- Competition
- Home team
- Away team
- Score or pre-match countdown
- Match state: not started, live, halftime, finished
- Tags: focus, high-risk, goal-trend, upset-watch

Selecting a row updates the center analysis panel.

### Center Match Analysis

Shows the currently selected match.

Content:

- Match header with teams, score, kickoff, competition, and state
- Win/draw/loss probabilities
- Over/under probability, default line such as 2.5 goals
- Half-time/full-time tendency
- Live momentum or pre-match trend chart
- Key factors: form, attack, defense, home/away, historical matchup, and odds movement status
- Risk level and model confidence

### Right Daily Parlay Center

Generates daily combination plans from selected high-quality predictions.

Plan types:

- Stable 2-leg parlay
- Balanced 3-pick 2-hit plan
- Coverage 4-pick 2-hit plan
- Aggressive 4-pick 3-hit plan

Each parlay card contains:

- Plan type
- Included matches
- Pick for each match
- Combined hit probability
- Risk level
- Strategy note
- Live probability change

### Bottom Review And Tomorrow Pool

Contains two panels:

- Today hit tracker: pending, hit, miss, void, live probability.
- Tomorrow watchlist: safe candidates, goal candidates, upset watch, half/full-time watch, avoid list.

## Core Features

### Match Data

First version uses mock JSON data. Future versions can replace the source with a real API or controlled import.

Each match should include:

- id
- date
- kickoffTime
- competition
- homeTeam
- awayTeam
- status
- score
- odds snapshot
- team stats snapshot
- model probabilities
- recommended markets

### Single Match Predictions

Supported markets:

- Win/draw/loss
- Over/under
- Half-time/full-time

Each market includes:

- Prediction
- Probability
- Confidence
- Risk
- Reason

### Daily Auto Selection

The system ranks matches by:

- Data quality
- Probability edge
- Risk level
- Market clarity
- Match importance
- Avoid flags

The UI should show why a match was selected or excluded.

### Parlay Probability

The first version can use deterministic mock calculations.

For all-hit parlays:

```text
combinedProbability = p1 * p2 * ... * pn
```

For x-hit coverage plans:

```text
combinedProbability = probability of at least x picks landing from n selections
```

Examples:

- 2-leg parlay: both picks must hit.
- 3-pick 2-hit plan: any 2 or 3 picks hit.
- 4-pick 2-hit plan: any 2, 3, or 4 picks hit.
- 4-pick 3-hit plan: any 3 or 4 picks hit.

The UI should label these as estimated model probabilities.

### Live Probability Updates

First version simulates live changes. Future versions can update from real match events.

Displayed states:

- Pre-match probability
- Current live probability
- Probability delta
- Final result
- Daily hit rate
- Recent 7-day hit rate based on mock history data

### Tomorrow Preparation

The tomorrow pool helps prepare picks before matchday.

Categories:

- Stable candidates
- Goal trend candidates
- Upset watch
- Half/full-time watch
- Not recommended

Each candidate includes the reason it is in that category.

## Data Flow

1. Load mock match data.
2. Normalize matches into dashboard state.
3. Compute market recommendations.
4. Rank matches for daily selection.
5. Generate parlay plans.
6. Render dashboard.
7. Simulate live probability changes.
8. Track today results and tomorrow watchlist.

## Project Structure

Recommended first version:

```text
index.html
styles.css
script.js
data/
  matches.json
docs/
  superpowers/
    specs/
      2026-06-08-world-cup-match-radar-design.md
```

Future expandable structure:

```text
src/
  api/
  engine/
  scheduler/
  ui/
data/
  matches.json
  history.json
```

## Error Handling

- If no matches exist, show an empty state with the next refresh time.
- If a match lacks probability data, mark it as data insufficient.
- If a parlay cannot be generated safely, show no recommendation instead of forcing one.
- If live data is stale, show the last update time and stale label.

## Testing And Verification

For the static template:

- Verify the page opens locally.
- Verify match selection updates analysis.
- Verify parlay cards calculate expected probability.
- Verify mobile layout keeps text readable.
- Verify no garbled Chinese text.

For future API-backed versions:

- Unit test probability helpers.
- Unit test parlay probability calculations.
- Unit test match ranking.
- Add stale-data and missing-data cases.

## Scope For First Implementation

The first implementation should:

- Delete the old visual demo files after confirmation.
- Rebuild the directory as a clean static dashboard.
- Use mock football match data.
- Implement match selection.
- Implement single-match prediction display.
- Implement daily parlay cards.
- Implement probability and hit-rate display.
- Implement tomorrow watchlist.
- Use a World Cup broadcast visual style.

It should not:

- Scrape real lottery or sportsbook data yet.
- Claim guaranteed betting outcomes.
- Require a backend server.
- Require HyperFrames rendering to run the dashboard.
