import { SOCIAL_ICONS, SOCIAL_LABELS, socialHref } from '@/components/menu/socialIcons';

// Social links are optional — an empty list renders a plain footer, never an
// empty row of holes. Href and label come from the shared helper so the public
// site and the admin agree on how each platform's value becomes a URL.
export default function SiteFooter({ socialLinks = [] }) {
  const links = socialLinks.filter((l) => SOCIAL_ICONS[l.platform]);

  return (
    <footer className="mx-footer">
      <span className="mx-footer-note">Maqaaxi &middot; scan, order, eat.</span>
      {links.length > 0 && (
        <ul className="mx-social">
          {links.map((l) => (
            <li key={l.platform}>
              <a
                href={socialHref(l.platform, l.value)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={SOCIAL_LABELS[l.platform] || l.platform}
                className="mx-social-link"
              >
                {SOCIAL_ICONS[l.platform]}
              </a>
            </li>
          ))}
        </ul>
      )}
    </footer>
  );
}
