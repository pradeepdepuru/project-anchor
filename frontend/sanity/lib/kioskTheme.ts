export type KioskTheme = 'dark' | 'light' | 'high-contrast'

export const resolveKioskTheme = (v?: string | null): KioskTheme =>
    v === 'light' || v === 'high-contrast' ? v : 'dark'

export const kioskThemeBody: Record<KioskTheme, string> = {
    dark: 'bg-zinc-950 text-zinc-100',
    light: 'bg-stone-50 text-zinc-100',
    'high-contrast': 'bg-black text-white',
}