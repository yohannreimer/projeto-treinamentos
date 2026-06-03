export type DocsIconName =
  | 'building'
  | 'gear'
  | 'layout'
  | 'book'
  | 'folder'
  | 'folder-open'
  | 'folder-clients'
  | 'folder-cert'
  | 'file-pdf'
  | 'file-img'
  | 'file-generic'
  | 'chevron-right'
  | 'plus'
  | 'share'
  | 'edit'
  | 'trash'
  | 'download'
  | 'eye'
  | 'copy'
  | 'link'
  | 'lock'
  | 'wiki'
  | 'search'
  | 'grid'
  | 'list'
  | 'sort'
  | 'upload'
  | 'check';

export function DocsIcon({ name, size = 16 }: { name: DocsIconName; size?: number }) {
  const props = {
    viewBox: '0 0 16 16',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const
  };

  switch (name) {
    case 'building':
      return (
        <svg {...props}>
          <rect x="2" y="3" width="12" height="11" rx="1" />
          <path d="M5.5 14V10h5v4" />
          <path d="M5 6.5h1.5M9.5 6.5H11M5 9h1.5M9.5 9H11" />
        </svg>
      );
    case 'gear':
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="2.5" />
          <path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.3 3.3l.9.9M11.8 11.8l.9.9M3.3 12.7l.9-.9M11.8 4.2l.9-.9" />
        </svg>
      );
    case 'layout':
      return (
        <svg {...props}>
          <rect x="1.5" y="1.5" width="13" height="4.5" rx="1" />
          <rect x="1.5" y="8" width="5.5" height="6.5" rx="1" />
          <rect x="9" y="8" width="5.5" height="6.5" rx="1" />
        </svg>
      );
    case 'book':
      return (
        <svg {...props}>
          <path d="M3 2.5h7.5a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H3" />
          <path d="M3 2.5A1.5 1.5 0 0 0 1.5 4v8a1.5 1.5 0 0 0 1.5 1.5" />
          <path d="M6 5.5h4M6 8h4M6 10.5h2.5" />
        </svg>
      );
    case 'folder':
      return (
        <svg {...props}>
          <path d="M1.5 4.5A1 1 0 0 1 2.5 3.5h3.3l1.4 1.5H13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V4.5z" />
        </svg>
      );
    case 'folder-open':
      return (
        <svg {...props}>
          <path d="M1.5 5.5A1 1 0 0 1 2.5 4.5h3.3l1.4 1.5H13a1 1 0 0 1 1 1v.5" />
          <path d="M1.5 7.5l1.2 5.5H13l1.5-5.5H1.5z" />
        </svg>
      );
    case 'folder-clients':
      return (
        <svg {...props}>
          <path d="M1.5 4.5A1 1 0 0 1 2.5 3.5h3.3l1.4 1.5H13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V4.5z" />
          <circle cx="8" cy="8.5" r="1.4" />
          <path d="M5.5 11.5c0-1.4 1.1-2.5 2.5-2.5s2.5 1.1 2.5 2.5" />
        </svg>
      );
    case 'folder-cert':
      return (
        <svg {...props}>
          <path d="M1.5 4.5A1 1 0 0 1 2.5 3.5h3.3l1.4 1.5H13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V4.5z" />
          <path d="M6 9l1.5 1.5L10.5 7.5" />
        </svg>
      );
    case 'file-pdf':
      return (
        <svg {...props}>
          <path d="M3 1.5h7l3 3v10a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 3 14.5V2a.5.5 0 0 1 0 0z" />
          <path d="M10 1.5V4.5H13" strokeWidth="1.2" />
          <text x="4.5" y="11.5" fontSize="4.5" fontWeight="700" fill="currentColor" stroke="none" fontFamily="system-ui">PDF</text>
        </svg>
      );
    case 'file-img':
      return (
        <svg {...props}>
          <path d="M3 1.5h7l3 3v10a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 3 14.5V2a.5.5 0 0 1 0 0z" />
          <path d="M10 1.5V4.5H13" strokeWidth="1.2" />
          <path d="M5 11.5l2.5-3 2 2.5 1.5-1.8 1.5 2.3H5z" />
          <circle cx="6.2" cy="7.8" r="0.9" />
        </svg>
      );
    case 'file-generic':
      return (
        <svg {...props}>
          <path d="M3 1.5h7l3 3v10a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 3 14.5V2a.5.5 0 0 1 0 0z" />
          <path d="M10 1.5V4.5H13" strokeWidth="1.2" />
          <path d="M5.5 8h5M5.5 10.5h3.5" />
        </svg>
      );
    case 'chevron-right':
      return (
        <svg {...props}>
          <path d="M6 3.5L10 8l-4 4.5" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...props}>
          <path d="M8 2.5v11M2.5 8h11" />
        </svg>
      );
    case 'share':
      return (
        <svg {...props}>
          <circle cx="12.5" cy="3.5" r="1.5" />
          <circle cx="12.5" cy="12.5" r="1.5" />
          <circle cx="3.5" cy="8" r="1.5" />
          <path d="M5 8l5.5-3.8M5 8l5.5 3.8" />
        </svg>
      );
    case 'edit':
      return (
        <svg {...props}>
          <path d="M10.5 2.5l3 3-8 8H2.5v-3l8-8z" />
          <path d="M8.5 4.5l3 3" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...props}>
          <path d="M2.5 4.5h11M6 4.5V3h4v1.5M5.5 4.5l.5 9h4l.5-9" />
          <path d="M6.5 7v4M9.5 7v4" />
        </svg>
      );
    case 'download':
      return (
        <svg {...props}>
          <path d="M8 2v9M4.5 7.5 8 11l3.5-3.5" />
          <path d="M2.5 13.5h11" />
        </svg>
      );
    case 'eye':
      return (
        <svg {...props}>
          <path d="M1.5 8c1.8-4 11.2-4 13 0-1.8 4-11.2 4-13 0z" />
          <circle cx="8" cy="8" r="2" />
        </svg>
      );
    case 'copy':
      return (
        <svg {...props}>
          <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
          <path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
        </svg>
      );
    case 'link':
      return (
        <svg {...props}>
          <path d="M6.5 9.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1 1" />
          <path d="M9.5 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1-1" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...props}>
          <rect x="3.5" y="7" width="9" height="7.5" rx="1" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
        </svg>
      );
    case 'wiki':
      return (
        <svg {...props}>
          <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" />
          <path d="M4.5 5h7M4.5 8h7M4.5 11h4" />
        </svg>
      );
    case 'search':
      return (
        <svg {...props}>
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5l3.5 3.5" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...props}>
          <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" />
          <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" />
          <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" />
          <rect x="9" y="9" width="5.5" height="5.5" rx="1" />
        </svg>
      );
    case 'list':
      return (
        <svg {...props}>
          <path d="M5.5 4h8M5.5 8h8M5.5 12h8" />
          <circle cx="2.5" cy="4" r="1" fill="currentColor" stroke="none" />
          <circle cx="2.5" cy="8" r="1" fill="currentColor" stroke="none" />
          <circle cx="2.5" cy="12" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'sort':
      return (
        <svg {...props}>
          <path d="M2 4.5h12M4 8h8M6 11.5h4" />
        </svg>
      );
    case 'upload':
      return (
        <svg {...props}>
          <path d="M8 10V1.5M4.5 5 8 1.5 11.5 5" />
          <path d="M2.5 11.5v2h11v-2" />
        </svg>
      );
    case 'check':
      return (
        <svg {...props}>
          <path d="M2.5 8.5l3.5 4 7.5-8" />
        </svg>
      );
    default:
      return null;
  }
}
