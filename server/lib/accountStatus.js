// Single source of truth for the account-status rules (ACTIVE | BLOCKED).
//
// Status lives in users.status and is read from the database on every authenticated request,
// at login and at refresh. It is never taken from a token or from client input, so a block (or a
// deletion) takes effect on the very next call from any client (web, mobile, extension).
const STATUS = Object.freeze({ ACTIVE: "ACTIVE", BLOCKED: "BLOCKED" });

const BLOCKED_CODE = "account_blocked";
const BLOCKED_MESSAGE = "Your account has been blocked. Please contact an administrator.";
const DELETED_MESSAGE = "Account no longer exists";

// Fails closed: anything other than the literal "ACTIVE" (including a missing value) is not active.
const isActive = (user) => Boolean(user) && user.status === STATUS.ACTIVE;

function sendBlocked(res) {
  return res.status(403).json({ message: BLOCKED_MESSAGE, code: BLOCKED_CODE });
}

// The access-token version a user's tokens must carry (tokens minted before token versioning have none = 0).
const tokenVersionOf = (user) => (user && Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0);

module.exports = { STATUS, BLOCKED_CODE, BLOCKED_MESSAGE, DELETED_MESSAGE, isActive, sendBlocked, tokenVersionOf };
