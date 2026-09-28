---
name: unity-guard
description: Enforce Unity performance and Inspector API guardrails when creating or editing C# scripts.
---

# Unity Guardrails

Apply these rules whenever you write, review, or modify Unity C# code.

## Per-frame methods

Treat `Update`, `LateUpdate`, and `FixedUpdate` as allocation- and lookup-sensitive code paths.

- Do not use string concatenation, LINQ, or `new` in these methods.
- Do not call `GetComponent`, `GetComponentInChildren`, `GetComponentInParent`, `Find`, `FindObjectOfType`, or related scene-search APIs in these methods.
- Cache components and scene references in `Awake` or `Start`.
- Move allocations out of frame loops, reuse data structures, and prefer object pools for frequently created objects.
- Replace LINQ with a `for` or `foreach` loop when a result is needed every frame.
- Update UI strings only when their source values change; avoid building strings every frame.

## Inspector fields and public API

- Do not expose mutable Unity Inspector references as `public` fields unless they are intentionally part of the component's public API.
- Prefer `[SerializeField] private` for Inspector-assigned fields.
- Use a property or explicit method when another component genuinely needs controlled public access.

## Required verification

Before finishing a Unity C# change:

1. Run `unity-guard lint <changed-file-or-project-path>` when the CLI is available.
2. Resolve every reported issue or explain why a documented exception is necessary.
3. In the final response, name the verification command and any intentional exception.

## Preferred pattern

```csharp
[SerializeField] private Rigidbody body;

private void Awake()
{
    body = GetComponent<Rigidbody>();
}

private void Update()
{
    // Reuse cached references and allocation-free control flow here.
}
```
