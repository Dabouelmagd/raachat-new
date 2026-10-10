export const SITE = (import.meta.env.VITE_SITE_URL as string | undefined) ?? "";
export const LEGAL = {
  privacy: `${SITE}/legal/privacy.html`,
  terms: `${SITE}/legal/terms.html`,
  community: `${SITE}/legal/community.html`,
  dataRequests: `${SITE}/legal/data-requests.html`,
  deleteAccount: `${SITE}/delete-account.html`,
};
