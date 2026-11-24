// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import fs from 'node:fs';
import path from 'node:path';

import type {Page} from '@playwright/test';
import {expect} from '@playwright/test';

export function evidencePath(name: string) {
    const dir = process.env.VERIFY_MM_EVIDENCE;
    if (!dir) {
        throw new Error('VERIFY_MM_EVIDENCE is unset; run journeys through scripts/verify-mattermost.sh drive');
    }
    fs.mkdirSync(dir, {recursive: true});
    return path.join(dir, name);
}

// Menus and popovers fade in; a screenshot taken on "visible" can catch them half transparent.
export async function capture(page: Page, name: string) {
    await expect
        .poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length))
        .toBe(0);
    const file = evidencePath(name);
    await page.screenshot({path: file});
    return file;
}
