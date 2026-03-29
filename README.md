# Transcript Control (`ot-transcript-control`)

An [Open Ticket](https://github.com/open-discord-bots/open-ticket) **v4** plugin that routes ticket transcripts to Discord channels based on the ticket option. You can mirror transcripts to extra archive channels or redirect them so they only go to your chosen channel (and skip the default transcript destination for that send).

## Requirements

- Open Ticket **v4.0.x**, **v4.1.x**, or **v4.2.x** (see `plugin.json` → `supportedVersions`).
- No extra npm dependencies.

## Installation

1. Copy this repository (or the plugin folder) into your bot’s plugins directory so the layout matches Open Ticket’s plugin resolution, for example:

   `plugins/ot-transcript-control/`

2. Ensure the folder contains at least:

   - `plugin.json`
   - `index.ts`
   - `config.json`

3. Enable the plugin in Open Ticket if your setup requires it (see your bot’s plugin configuration).

4. Edit `config.json` (see below) and restart the bot.

## Configuration

Configuration is a **JSON array** of route rules in `config.json`. Each rule has:

| Field       | Required | Description |
|------------|----------|-------------|
| `optionid` | No       | Ticket **option id** this rule applies to. Omit or use an empty string for a **fallback** rule (see routing order). Max length 128. |
| `channel`  | Yes      | Discord **channel id** (snowflake) where a copy of the transcript message is sent. Must be a text-based channel on the bot’s main server. |
| `mode`     | No       | `mirror` (default) or `redirect` — see modes below. |

### Modes

- **`mirror`** — After the normal transcript flow, the plugin also sends the same transcript message to the configured `channel`. The default Open Ticket transcript behavior is unchanged.
- **`redirect`** — The transcript is still sent to your archive `channel`, but the plugin **suppresses** the default channel message for that compilation (so that send only goes to your archive channel, relative to the wrapped compiler output).

### Routing order

Rules are evaluated **in array order**:

1. The first rule whose `optionid` **exactly matches** (after trim) the ticket’s option id wins.
2. Otherwise, the **first rule with an empty / missing `optionid`** is used as the fallback.
3. If no rule matches, the plugin does nothing and Open Ticket behaves as usual.

### Example `config.json`

```json
[
  {
    "optionid": "billing-tickets",
    "channel": "1234567890123456789",
    "mode": "mirror"
  },
  {
    "optionid": "private-escalation",
    "channel": "9876543210987654321",
    "mode": "redirect"
  },
  {
    "optionid": "",
    "channel": "1112223334445556667",
    "mode": "mirror"
  }
]
```

The last row is a **fallback** for any ticket option that did not match the earlier rows.

Open Ticket’s config checker validates this file when you use the CLI tooling; see the checkers registered in the plugin for field descriptions and allowed values.

## How it works

The plugin listens for `onTranscriptCompilerLoad` and wraps the built-in **text** and **HTML** transcript compilers. When a transcript is ready, it resolves the route for `ticket.option.id`, optionally sends `channelMessage` to the archive channel, and in `redirect` mode clears `channelMessage` so the default destination is not used for that result.

If the main guild is unavailable, the archive channel cannot be resolved, sending fails, or the matched rule has an empty `channel`, the plugin logs an error and falls back to pass-through behavior where appropriate.

## Project metadata

- **Plugin id:** `ot-transcript-control`
- **Version:** see `plugin.json`
- **Author:** kampert.it (from `plugin.json`)

## License

This project is licensed under the GNU General Public License v3.0 — see [`LICENSE`](LICENSE).
