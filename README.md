# Baris IML — Order Management

React/TypeScript frontend for the existing NestJS and Prisma backend. The interface uses graphite and orange theme tokens, with responsive desktop/tablet/mobile navigation and light/dark themes.

## Run the interface

```sh
npm ci --prefix frontend
npm run dev --prefix frontend
```

Open the Vite address shown in the terminal. Choose **Open interactive demo** on the sign-in screen to review the interface without a database. Demo state is stored separately in browser local storage and can be reset using the banner. Demo sign-in uses session storage. No demo action calls the server or sends an invitation, proof, order or email.

To use real accounts, configure the backend environment and database, then run the existing backend setup commands and `npm run dev` from the repository root. Frontend requests use `/api/v1`; Vite proxies `/api` to the backend on port 3000. Production builds are served by the existing NestJS static SPA handler.

## Pages and integration

| Pages                                                      | Behaviour                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Staff and customer sign-in, password recovery/reset/change | Existing auth API; bearer sessions with shared refresh and logout revocation                                                               |
| Overview                                                   | Permission-aware customer/SKU summaries and notification counts                                                                            |
| Customers and customer details                             | Search, pagination, create/edit, contacts, delivery sites, label links and activity                                                        |
| Label library and SKU detail                               | Search/filter/pagination, create/edit, catalogue material selection, draft revisions and approval                                          |
| Materials and master data                                  | Create/edit active material types, finishes, colour systems, label types, applications, payment terms, carriers and machines               |
| Tooling and plate sets                                     | Search, pagination and asset create/edit                                                                                                   |
| Team                                                       | Invite/create and edit staff accounts; display assigned roles                                                                              |
| Settings                                                   | Company identity and commercial defaults                                                                                                   |
| Notifications                                              | Record links and mark-read actions                                                                                                         |
| Audit                                                      | Search by action, pagination, before/after inspection and API CSV export                                                                   |
| Customer portal                                            | Tenant-scoped labels and approved specifications, organisation contacts/sites, editable email/phone and new delivery sites where permitted |
| Orders, artwork, quotations, production and dispatch       | Explicit design previews: sample records and editable states in demo; explanatory empty states in live mode                                |

The backend is a Phase 2 foundation. It does **not** yet contain artwork/proof, quotation, order, production-job, dispatch or stock-ledger APIs. Preview workflows must not be used for operational approvals, commitments or dispatches. The material catalogue contains material types and thickness, not on-hand inventory, receipts or lots.

Specification colour editing currently exposes the first colour reference while preserving additional existing references and tolerance metadata. The specification API remains the authority for lifecycle validation. Approved revisions are immutable; approving a draft supersedes the prior approved revision.

## Checks

```sh
npm run test --prefix frontend
npm run build --prefix frontend
npm run generate
npm test
npm run typecheck
```

Frontend tests cover concurrent session refresh, session revocation, conflict recovery without logout, demo specification lifecycle/material hydration, tenant-filtered demo labels and search/pagination. The existing backend unit tests remain unchanged.

Browser QA: demo login, library, new SKU, material selection, draft save, approval and current-revision display. Live API/database integration requires a configured PostgreSQL instance and real test accounts; it has not been exercised in this workspace.

## Design conventions

- Reuse `frontend/src/index.css` theme tokens; the graphite and orange palette is not yet verified against official Baris brand colours.
- Use Lucide icons and shared `components/ui.tsx` controls.
- Keep navigation and actions permission-aware. Backend authorization and tenant isolation enforce access; frontend guards are presentation controls.
- Return errors inline, retain form input on failure and show retryable loading/error/empty states.
- Modal dialogs trap keyboard focus, restore focus on close, and support Escape.
