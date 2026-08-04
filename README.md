# mcp-easypost

EasyPost MCP — multi-carrier shipping rates + package tracking (easypost.com)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `easypost_rates` | Get shipping rate quotes from `<from_zip>` to `<to_zip>` for a parcel — returns multi-carrier rates (USPS, UPS, FedEx, etc.) with price, service level, and estimated delivery days. Example: easypost_rates({ from_zip: "94105", to_zip: "10001", weight_oz: 16, _apiKey: "your-key" }) |
| `easypost_track` | Track a package by tracking number — returns current status, carrier, estimated delivery date, and recent scan events. Example: easypost_track({ tracking_code: "9400100000000000000000", carrier: "USPS", _apiKey: "your-key" }) |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "easypost": {
      "url": "https://gateway.pipeworx.io/easypost/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Easypost data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
