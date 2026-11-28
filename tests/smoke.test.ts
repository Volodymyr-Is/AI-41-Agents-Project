import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';

import RootLayout, { metadata } from '../app/layout';
import HomePage, { APP_TITLE, APP_SUBTITLE } from '../app/page';

describe('app/page.tsx', () => {
  it('експортує компонент за замовчуванням, який повертає React-елемент', () => {
    expect(typeof HomePage).toBe('function');
    expect(isValidElement(HomePage())).toBe(true);
    expect(APP_TITLE).toContain('FitPulse');
    expect(APP_SUBTITLE.length).toBeGreaterThan(0);
  });
});

describe('app/layout.tsx', () => {
  it('оголошує українську локаль і непорожній заголовок сторінки', () => {
    const tree = RootLayout({ children: null });
    const props = tree.props as { lang?: string };

    expect(props.lang).toBe('uk');
    expect(typeof metadata.title).toBe('string');
    expect(String(metadata.title).length).toBeGreaterThan(0);
  });
});
