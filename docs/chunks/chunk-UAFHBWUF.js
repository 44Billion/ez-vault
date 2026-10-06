import {
  isValidEvent,
  parseProfileEvent
} from "./chunk-AOOKD7QI.js";

// src/helpers/account-metadata.js
function isAccountMetadataEvent(event, pubkey, kind) {
  return Boolean(event && event.pubkey === pubkey && event.kind === kind && isValidEvent(event));
}
function isNewerAccountMetadata(event, previous, pubkey, kind) {
  return isAccountMetadataEvent(event, pubkey, kind) && (!isAccountMetadataEvent(previous, pubkey, kind) || event.created_at > previous.created_at || event.created_at === previous.created_at && event.id < previous.id);
}
function accountProfile(account) {
  const event = account.profileEvent;
  const signed = isAccountMetadataEvent(event, account.pubkey, 0);
  const legacy = event?.kind === 0 && event.pubkey === account.pubkey && event.created_at === 0 && event.id === void 0 && event.sig === void 0;
  const parsed = parseProfileEvent(signed || legacy ? event : void 0);
  return {
    name: parsed.name || account.name || "",
    picture: parsed.picture || account.picture || "",
    about: signed ? parsed.about : parsed.about || account.about || ""
  };
}

export {
  isAccountMetadataEvent,
  isNewerAccountMetadata,
  accountProfile
};
