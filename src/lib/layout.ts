// Shared horizontal page container: full width with responsive padding
// that grows with the viewport (mobile small -> tablet medium -> desktop
// generous), capped at 1600px so very large monitors don't stretch body
// text into unreadably long lines. Every page's <main> and the NavBar use
// this exact string so page content and the nav bar align pixel-for-pixel
// at every screen size — don't let any one page drift to a different
// max-width/padding scale.
export const CONTAINER_CLASS = "mx-auto max-w-[1600px] px-4 sm:px-6 md:px-8 xl:px-12 2xl:px-16";
