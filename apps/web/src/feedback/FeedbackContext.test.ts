import { describe, expect, it } from 'vitest';
import { feedbackRoute } from './FeedbackContext';

describe('feedback route context', () => {
  it('removes event join codes from dynamic routes', () => {
    expect(feedbackRoute('/e/ABC123')).toBe('/e/:joinCode');
    expect(feedbackRoute('/host/ABC123/settings')).toBe(
      '/host/:joinCode/settings',
    );
  });

  it('keeps non-event routes intact', () => {
    expect(feedbackRoute('/match')).toBe('/match');
    expect(feedbackRoute('/')).toBe('/');
  });
});
