// Applies the stored theme before first paint (inlined by the root layout).
// Plain module (no "use client") so the server layout can read the string.
export const THEME_KEY = "star_theme";
export const THEME_INIT_SCRIPT = `try{var t=JSON.parse(localStorage.getItem("${THEME_KEY}")||'"dark"');if(t==="light"){document.documentElement.dataset.theme="light"}}catch(e){}`;
