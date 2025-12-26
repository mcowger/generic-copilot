# Claude Code Integration


## V2 (`ccv2`)
⚠️ **Highly Experimental Feature** ⚠️
This version drastically simplifies the implementation, making use of direct APIs and truly native tool calls.  Its very experimental, and may not optimally use CC quota.

To configure:

## Installation Requirements
1. Have *native* Claude Code executable installed and accessible (installed via `curl -fsSL https://claude.ai/install.sh | bash` or via Homebrew).  You MUST use the `bun`-native one, not the one installed via `npm`.
2. Make sure `ANTHROPIC_API_KEY` is not set (or is valid).  If present, it will be used.
2. Ensure you have logged into `claude` at least once.
3. Run `claude setup-token` and record the token that is displayed.  This is your API token - keep it safe somewhere.
4.  Follow the standard instructions to setup a provider and model.  When asked for an API key, use the key selected in Step 3 above.

### Notes:

Valid models are:
* claude-sonnet-4-5
* claude-haiku-4-5
* claude-opus-4-5

### Caveats:

* This *does* implement strong caching.
* This may not be as reliable as claude's own tools
* This may violate your ToS with Anthropic.

## How It Works

Unlike other AI coding solutions that rely on VS Code's built-in Copilot tools, the Claude Code integration allows Claude to use its own native tools directly. This approach offers several distinct advantages and trade-offs.

### Advantages

**🎯 Request Efficiency**
- Claude Code uses its own built-in tools natively
- No need for verbose tool descriptions or complex parameter marshaling
- Significantly more efficient than solutions like Kilo Code or Roo Code
- Direct access to Claude's full tool suite

**⚡ Performance**
- Streamlined communication between Claude and its tools
- Minimal overhead compared to proxy-based solutions
- Native tool execution within Claude's runtime

---

**Remember:** This integration is experimental and may change significantly. Use it if you value Claude Code's native capabilities over VS Code's standard tooling integration.