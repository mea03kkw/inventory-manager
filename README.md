# HC R&amp;D Sample Library

Internal web application for managing sample inventory, checkout, and return tracking.

## Features

- Sample inventory management
- Sample photo attachment (Admin: upload/replace/delete, auto-compressed to ≤300 KB)
- Checkout and return tracking
- Role-based access control (Admin / User)
- Responsive UI for desktop and mobile
- Internal operational workflow support

## Development Setup

```bash
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

## Authentication

### Production

- No default credentials are provided.
- All accounts must be created by Admin.
- Users should change their password on first login.

### Development

For local development only, credentials may be configured through environment variables.
Do not use weak or default passwords in production.

Example:

```bash
DEV_ADMIN_USERNAME=admin
DEV_ADMIN_PASSWORD=change_this_to_a_strong_password
```

Never commit real credentials into the repository.

## API Routes Summary

### Authentication
- `POST /api/auth/login`
- `POST /api/auth/logout`

### Sample Library
- `GET /api/samples`
- `POST /api/samples` (Admin)
- `PUT /api/samples/{id}` (Admin)
- `DELETE /api/samples/{id}` (Admin)

### Sample Photo Management
- `POST /api/items/{id}/photo` (Admin)
- `DELETE /api/items/{id}/photo` (Admin)
- `GET /api/items/{id}/photo` (Authenticated)

### Checkout / Return
- `POST /api/checkout`
- `POST /api/return`

### User Management
- Admin creates, updates, and disables users

## Security Notes

- Default credentials are not allowed in production.
- Passwords are hashed using bcrypt.
- API documentation should be disabled in production.
- Admin-only account creation is enforced.
- Ongoing hardening items include session security, CSRF protection, and audit logging.

## Version History

### V1.5
Focus: single-photo attachment for samples

- Admin-only photo upload, replace, and delete
- Client-side Canvas-based image compression (target ≤300 KB)
- Server-side Pillow image validation and compression
- Compact photo section in existing Add/Edit Sample modal
- Desktop file picker and mobile camera capture support
- Photo thumbnail display in sample detail view
- Railway persistent volume storage for photo files
- Authenticated photo serving endpoint

### V1.4
Focus: documentation cleanup and release control

- Separated production and development authentication guidance
- Added structured Security Notes section
- Added formal Version History tracking in README
- Improved deployment and release documentation clarity

### V1.3
Focus: UI/UX and modal optimization

- Compact modal layout improvements
- Mobile modal scrolling improvements
- Checkout and Return modal refinement
- Table and spacing density improvements
- CSS adjustments for more consistent layout behavior

### V1.2
Focus: authentication and baseline security hardening

- Admin-only account creation
- Public registration disabled
- Password hashing with bcrypt
- Production API docs exposure removed

### V1.1
Focus: core business workflow

- Sample inventory CRUD
- Checkout and return workflow
- Basic role separation between Admin and User

### V1.0
Initial release

- Basic sample tracking system
- Initial UI and workflow foundation
- Early database-backed implementation

## Deployment Notes

- Hosted on Railway
- PostgreSQL database
- Manual deploy is recommended for controlled release management

## Important

This system is intended for internal use only.

Ensure:
- strong passwords
- controlled repository access
- secure environment variable handling