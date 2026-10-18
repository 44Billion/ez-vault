# Signer performance diagnostics

Development signer replies include an internal diagnostics.vaultDurationMs field,
measured from signer-request dispatch through reply preparation. The launcher
associates it with the request and measures queue waiting separately. Production
replies and public NIP07 arguments are unchanged. No payloads, ciphertext, scopes
or secrets enter these measurements. Activity-log persistence remains background
work and is never awaited before replying. Scheduling belongs to the launcher;
the vault does not infer app priorities or add another signer-request queue.

DoubleDH encryption waits for its locally persisted content key, not relay
discovery or announcement. A single background publication worker coalesces
account/content-key tasks and shares work with periodic refresh. Failed jobs use
1–30s jittered backoff; new encryptions do not restart deadlines. Offline jobs
wait on the shared connectivity monitor. Lock, removal, rotation and page close
fence stale work. Scoped signers retain their original account availability.
Explicit publication/rotation and public double-signing contracts are unchanged.
Development timing distinguishes own-key lookup and announcement from the signer
reply; background failures do not change a successful encryption result.
