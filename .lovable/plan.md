

# Fix: Creditos Infinitos - Frontend Blocking Transfers

## Root Cause

The error "Voce tem 0 creditos, mas precisa de 1" happens **before** the edge function is even called. The problem is on **line 203** of `Carteira.tsx`:

```typescript
if (creditBalance === null || creditBalance < parseInt(creditAmount)) {
  toast({ title: "Creditos insuficientes", ... });
  return;
}
```

For unlimited users, `creditBalance` is set to `null` (line 84), so `creditBalance === null` is `true`, which triggers the error toast and **blocks the request entirely**. The edge function (which correctly handles `is_unlimited`) never gets called.

## Solution

Update the frontend validation in `handleAddCredits` to skip the balance check when the user has unlimited credits (`isUnlimited === true`).

### File: `src/pages/Carteira.tsx`

**Change line 203** from:
```typescript
if (creditBalance === null || creditBalance < parseInt(creditAmount)) {
```
to:
```typescript
if (!isUnlimited && (creditBalance === null || creditBalance < parseInt(creditAmount))) {
```

This single-line fix ensures:
- Unlimited users bypass the frontend balance validation entirely
- The edge function handles the rest (it already works correctly for unlimited users)
- Non-unlimited users still get the same frontend validation as before

## No Other Changes Needed

The edge functions (`transfer-credits-master-to-master`, `mp-create-payment`, `mp-webhook-handler`) already correctly check for `is_unlimited` and skip balance validation when it's `true`. Only the frontend was blocking the flow.

