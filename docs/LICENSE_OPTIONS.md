# License Options

This document exists so the repository can move forward on release prep without silently choosing a license on behalf of the maintainer.

## Recommendation

If the goal is:

- broad adoption
- commercial friendliness
- clear patent posture
- infrastructure-style ecosystem positioning

then the default recommendation is:

```text
Apache-2.0
```

## Why Apache-2.0 Fits Gohan

Gohan is being positioned as infrastructure and control-plane software, not as a content project or a small single-purpose utility.

Apache-2.0 is a strong fit because it:

- is familiar in infrastructure and platform ecosystems
- includes an explicit patent grant
- is widely acceptable for startups and commercial users
- avoids the ambiguity of permissive licensing without explicit patent language

## When MIT Could Still Be Better

Choose MIT instead if the highest priority is:

- absolute simplicity
- minimal legal text
- lowest friction for copy/paste reuse

MIT is fine, but it gives up the stronger patent language that Apache-2.0 provides.

## When Not To Choose Either

If the goal is to force modifications to remain open source, a copyleft license would need to be considered separately.

That would be a product strategy decision, not just a repository setup decision.

## Practical Suggestion

For the current direction of Gohan, a pragmatic release sequence is:

1. choose Apache-2.0 unless there is a strong reason not to
2. add `LICENSE`
3. if Apache-2.0 is chosen, add `NOTICE` later if needed
4. mention the choice in the first public release notes
