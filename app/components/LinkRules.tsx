/** What possession of a gift link allows. Shown after creating, and on the claim page. */
export function LinkRules() {
  return (
    <ul className="mt-5 list-disc space-y-1.5 pl-5 text-sm text-muted">
      <li>Anyone who has the link can claim and read the message. Forwarding it passes that on.</li>
      <li>First come, first served, one claim per address, until the claims run out or it expires.</li>
      <li>One person with several addresses could take several claims, so share it with people you trust.</li>
      <li>You can claim your own gift too. Unclaimed $WIF can be reclaimed from My gifts after expiry.</li>
    </ul>
  );
}
