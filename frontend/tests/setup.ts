import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

// findBy*/waitFor give up after 1s by default. When the whole suite runs, ~30
// jsdom workers share the CPU and a *ByRole query over a full page alone can
// take most of that second, so a page that renders fine was reported as
// missing (a different test each run). testTimeout in vitest.config already
// allows for the load; this lets the queries inside a test wait as long.
configure({ asyncUtilTimeout: 5000 });
