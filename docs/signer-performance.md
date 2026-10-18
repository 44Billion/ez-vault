# Signer performance diagnostics

Development signer replies include an internal diagnostics.vaultDurationMs field,
measured from signer-request dispatch through reply preparation. The launcher
associates it with the request and measures queue waiting separately. Production
replies and public NIP07 arguments are unchanged. No payloads, ciphertext, scopes
or secrets enter these measurements. Activity-log persistence remains background
work and is never awaited before replying. Scheduling belongs to the launcher;
the vault does not infer app priorities or add another queue.
