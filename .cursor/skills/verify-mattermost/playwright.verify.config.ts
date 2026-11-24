// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Run only through scripts/verify-mattermost.sh drive, which sets NODE_PATH to
// e2e-tests/playwright/node_modules so these imports resolve from outside that package.
import path from 'node:path';

import {defineConfig, devices} from '@playwright/test';

const repo = path.resolve(__dirname, '../../..');
const evidence = process.env.VERIFY_MM_EVIDENCE ?? path.join(repo, 'e2e-tests/playwright/.verify-results/evidence');

export default defineConfig({
    globalSetup: path.join(repo, 'e2e-tests/playwright/global_setup.ts'),
    testDir: path.join(__dirname, 'journeys'),
    outputDir: path.join(evidence, 'playwright-output'),
    workers: 1,
    retries: 0,
    timeout: 3 * 60 * 1000,
    expect: {timeout: 15 * 1000},
    reporter: [['list']],
    use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.PW_BASE_URL ?? 'http://localhost:8065',
        headless: process.env.PW_HEADLESS !== 'false',
        viewport: {width: 1280, height: 900},
        locale: 'en-US',
        timezoneId: 'America/Los_Angeles',
        screenshot: 'off',
        trace: 'retain-on-failure',
        actionTimeout: 30 * 1000,
    },
});
