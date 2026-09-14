/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as choirSettings from "../choirSettings.js";
import type * as events from "../events.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_capabilities from "../lib/capabilities.js";
import type * as lib_pieceAccess from "../lib/pieceAccess.js";
import type * as lib_pieceAttachmentPolicy from "../lib/pieceAttachmentPolicy.js";
import type * as lib_text from "../lib/text.js";
import type * as members from "../members.js";
import type * as pieceAttachments from "../pieceAttachments.js";
import type * as pieces from "../pieces.js";
import type * as public_ from "../public.js";
import type * as seed from "../seed.js";
import type * as voiceParts from "../voiceParts.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  choirSettings: typeof choirSettings;
  events: typeof events;
  "lib/auth": typeof lib_auth;
  "lib/capabilities": typeof lib_capabilities;
  "lib/pieceAccess": typeof lib_pieceAccess;
  "lib/pieceAttachmentPolicy": typeof lib_pieceAttachmentPolicy;
  "lib/text": typeof lib_text;
  members: typeof members;
  pieceAttachments: typeof pieceAttachments;
  pieces: typeof pieces;
  public: typeof public_;
  seed: typeof seed;
  voiceParts: typeof voiceParts;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
