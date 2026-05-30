import { SidebarTrigger } from '../ui/sidebar';

/**
 * The sidebar toggle as a floating control — an absolute overlay pinned to the page's
 * top-left corner that reserves NO layout space, so content keeps full width (important on
 * mobile) and the paper runs to the top edge. It opens the sidebar on desktop and the
 * off-canvas Sheet on mobile. Chat aligns its first question to this toggle.
 */
export const Header = () => {
  return (
    <header className="pointer-events-none absolute left-0 top-0 z-50 pl-3 pt-3.5 md:pl-5">
      {/* Ghost button, mirrored across the seam: its inset matches the sidebar settings gear's
          inset from the seam (gear = SidebarHeader pr + row px-1), so the two read as a reflection. */}
      <SidebarTrigger className="pointer-events-auto" />
    </header>
  );
};
