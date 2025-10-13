# Access Control

AIGNE Hub employs a multi-layered access control strategy to ensure that both administrative functions and API endpoints are properly secured. This includes role-based access for administrative tasks and mandatory authentication for all API and internal component calls.

## Role-Based Access Control (RBAC)

Administrative functions, such as managing AI providers, credentials, and model rates, are protected to prevent unauthorized access. Access to these sensitive operations is restricted to users with specific roles.

By default, AIGNE Hub defines two administrative roles:

*   **Owner**: The primary administrator with full permissions.
*   **Admin**: A user granted administrative privileges.

This is enforced using an `ensureAdmin` middleware that checks if the authenticated user's role is either `owner` or `admin` before allowing the request to proceed.

```typescript security.ts icon=logos:typescript
import { auth } from '@blocklet/sdk/lib/middlewares';

export const ensureAdmin = auth({ roles: ['owner', 'admin'] });
```

This middleware is applied to all administrative routes, effectively creating a security gate for sensitive settings.

### Example: Securing Provider Management

All API endpoints for creating, updating, or deleting AI providers and their associated settings are protected by the `ensureAdmin` middleware. Any attempt to access these endpoints without the proper role will be rejected.

```typescript routes/ai-providers.ts icon=logos:typescript
// Example: Creating a new AI provider
router.post('/', ensureAdmin, async (req, res) => {
  // ... logic to create a provider
});

// Example: Deleting a provider
router.delete('/:id', ensureAdmin, async (req, res) => {
  // ... logic to delete a provider
});

// Example: Creating a credential
router.post('/:providerId/credentials', ensureAdmin, async (req, res) => {
  // ... logic to create a credential
});
```

## API and Component Authentication

Beyond role-based restrictions, AIGNE Hub requires authentication for all API interactions to ensure that every request is associated with a legitimate user or system component.

### User Session Authentication

Standard user-facing API endpoints are secured using a session middleware. This middleware authenticates the user based on their session, making user context (like `req.user.did`) available for subsequent logic.

```typescript routes/user.ts icon=logos:typescript
import sessionMiddleware from '@blocklet/sdk/lib/middlewares/session';

const user = sessionMiddleware({ accessKey: true });

// All routes in this file are protected by the 'user' middleware
router.get('/credit/balance', user, async (req, res) => {
  // Access user DID via req.user.did
});

router.get('/model-calls', user, async (req, res) => {
  // ...
});
```

### Internal Component Call Verification

For secure communication between internal components, AIGNE Hub uses a signature verification mechanism. The `ensureComponentCall` middleware validates a cryptographic signature attached to the request, ensuring that the call originates from a trusted internal source and hasn't been tampered with.

```typescript security.ts icon=logos:typescript
import { CustomError } from '@blocklet/error';
import { getVerifyData, verify } from '@blocklet/sdk/lib/util/verify-sign';
import { NextFunction, Request, Response } from 'express';

export function ensureComponentCall(fallback?: (req: Request, res: Response, next: NextFunction) => any) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const { data, sig } = getVerifyData(req);
      const verified = verify(data, sig);
      if (!verified) throw new CustomError(401, 'verify sig failed');
    } catch (error) {
      if (!fallback) throw error;

      fallback(req, res, next);
      return;
    }

    next();
  };
}
```

## Fine-Grained Endpoint Permissions

In addition to global middleware, some endpoints implement more granular, context-aware permission checks directly within their logic. This allows for dynamic access control based on the specific request parameters.

A clear example is the `/model-calls` endpoint. While all users can view their own call history, only administrators can view the history for *all* users. This is handled by a dedicated middleware that checks the user's role if the `allUsers=true` query parameter is present.

```typescript routes/user.ts icon=logos:typescript
router.get(
  '/model-calls',
  user, // First, ensure the user is authenticated
  async (req, res, next) => {
    const { allUsers } = await modelCallsSchema.validateAsync(req.query, { stripUnknown: true });

    // If 'allUsers' is requested, check for admin/owner role
    if (allUsers) {
      const list = ['admin', 'owner'];
      if (req.user?.role && !list.includes(req.user?.role)) {
        return res.status(403).json({ error: 'Insufficient permissions. Admin or owner role required.' });
      }
    }

    return next(); // Proceed if permissions are sufficient
  },
  async (req, res) => {
    // ... Main endpoint logic to fetch model calls
  }
);
```
This layered approach ensures that access is controlled at multiple levels, from broad role-based gating of entire feature sets to specific, conditional checks within individual API endpoints, providing robust security for the entire system.