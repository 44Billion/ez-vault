# TODO: paired signers, backups and bunker compatibility

Status: synchronization work deferred. Recorded on 2026-10-11; decision updated
on 2026-10-13. NostrDB synchronization remains limited to local `nsec` accounts.
The launcher now omits content-key methods from injected bunker signer objects.

## Current decision

Ordinary `bunker://` accounts remain remote NIP-46 signers. The launcher must
omit `doubleSignEvent`, `nip44v3.encryptDoubleDH` and
`nip44v3.decryptDoubleDH` for these accounts, including persona, namespace and
`withSharedKey` variants. This policy applies even if a remote implementation
claims to support the corresponding commands, once its explicit capability is
known. Writable legacy accounts with missing capability metadata temporarily
offer these methods through the consumer's `!isReadOnly` fallback. An explicit
vault `false` withdraws that provisional support. Other injected methods keep their
existing behavior; the launcher still provides the account's local NostrDB.

The vault advertises `supportsContentKeyMethods` only for `nsec` accounts.
The launcher persists this capability with the account metadata and uses its
last known value in the initial app handshake even before the vault reconnects.
Legacy records retain an absent/unknown stored value until their first vault
snapshot; the inferred consumer fallback is never saved. The storage audit treats
this field as required when checking accounts without a valid workspace, while
preserving workspace-owned legacy records with the field absent;
live snapshots update the stored value and open app method surfaces. The internal
capability list is named `pubkeysSupportingContentKeyMethods` and is scoped to
the document's accessible accounts. Read-only legacy accounts also omit the
three methods. No content-key synchronization, backup role or secret-transfer
protocol is implemented by this capability change.

The earlier proposal to expand bunker NostrDB synchronization now is cancelled.
Even event-only synchronization needs the existing shared-key context and NIP-44
v3 channel operations. Adapters alone do not establish remote support; verify
specific versions of implementations such as Amber or nak before any future
compatibility work. This document is not a live compatibility inventory.

## Future paired signer or backup wrapper

A service that wants full content-key functionality should expose a vault-like
wrapper and join trusted-device pairing. This is a different integration from
importing individual `bunker://` URLs: pairing establishes participant identities,
trust and authorized account transfer, while a bunker URL establishes a remote
signing connection. Do not silently turn an imported bunker into a paired backup.

The wrapper would own its account secrets and content keys, participate in their
synchronization, perform Double DH and double signing, rotate keys and retain
older content keys for decryption under an agreed retention policy. An embedded
launcher/storage layer could provide a NostrDB for event backup and synchronization.
A backup service could additionally offer legacy bunker URLs for apps that need
NIP-46, but that optional interface does not replace its paired-device role or
change the injected capability policy for accounts imported as `bunker`.

A future backup role could allow continuous encrypted replication of explicitly
authorized account secrets (`nsec`), including keys added or changed after initial
pairing. This is a separate feature requiring a defined authorization and
revocation model; ordinary device trust is not permission to export every nsec.

Before implementing a backup role, decide how the peer declares and proves its
role, which accounts it may receive, how new accounts become authorized, and
how acknowledgements, retry, rotation and removal work. Decide whether to reuse
an existing private transport with distinct message types or introduce a separate
context. An account channel derived from an identity key cannot bootstrap that
key to a peer that does not yet possess it; a device-level pairing/backup transport
is needed for that case. Do not invent or ship protocol commands from this note.

## Channel identity and participant authorization

The current account channel is derived with
`accountSigner.withSharedKey(account.pubkey, 'trusted-signer-sync-v1')`.
It uses the account identity and a derivation context, not a content key.

Access to that channel is distinct from receiving its messages. The messenger
uses each vault's device signer as its participant identity, encrypts internal
messages for recipient pubkeys, and the sync handlers verify trusted senders.
A remote signer knowing the account identity cannot thereby read messages
addressed to a vault's device signer.

An autonomous wrapper must have its own participant keypair, learn the public
keys of authorized peers, become an authorized recipient/sender and implement
pairing, discovery and revocation. No peer device private key needs to be shared.
Content-key authorization and any backup permission must be defined explicitly;
knowledge of the account pubkey or an existing NIP-46 session is insufficient.

## Boundaries and rejected alternatives

Keep identity-key operations inside their signer. Do not expose identity ECDH
`shared_x` as a shortcut for locally assembling Double DH: this persistent
pairwise secret permits conventional identity-based decryption independently of
future bunker authorization, and revoking a session cannot revoke an exported
copy. Passing private content keys on every cryptographic request is also not
the selected architecture.

Local proof signing followed by remote `sign_event` can construct a double-signed
event, but does not also solve Double DH while retaining identity ECDH secrets in
the remote signer. It is not a fallback for ordinary bunker accounts.

## Implementation references and future validation

- [Pairing host](../src/components/sync/sync-host.js),
  [pairing joiner](../src/components/sync/sync-joiner.js) and
  [account intake](../src/services/account-intake.js): empty account selections
  still establish device trust; selections govern initial account transfer.
- [Sync controller](../src/services/sync/index.js) and
  [NostrDB synchronization](../src/services/sync/nostrdb.js): local `nsec` account
  channels, inventory, live pushes and app backfills. Device trust-list channels
  are separate from account channels; messenger recovery storage stays local.
- [Content-key synchronization](../src/services/sync/content-keys.js): local
  `nsec` metadata announcements and encrypted secret replies. A copy received by
  a vault is not automatically imported or used by its remote bunker.
- [Bunker adapters](../src/services/bunker.js) and
  [adapter tests](../tests/bunker.test.js): shared-key and extended-command
  forwarding exist, but tests use stubs and prove no live bunker interoperability.
- [Key derivation](../src/helpers/crypto.js) and
  [local signer](../src/services/nsec-signer.js): channel derivation must remain
  interoperable across paired signers without exporting identity secrets.

Future wrapper/backup work must validate authenticated enrollment, account and
role permissions, initial and subsequent secret transfer, content-key convergence,
historical-key decryption, event synchronization, lock/unlock, retries, acknowledgements
and revocation. Existing `nsec` devices and zero-selection pairing must retain
current behavior. Importing a legacy bunker URL must continue to omit the three
content-key methods and must not grant backup permissions.
