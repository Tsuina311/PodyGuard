/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  speechRecognitionConstructor,
  useSpeechRecognition,
  type SpeechRecognitionLike,
} from './use-speech-recognition';

class FakeRecognition implements SpeechRecognitionLike {
  lang = '';
  continuous = true;
  interimResults = true;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  onresult: SpeechRecognitionLike['onresult'] = null;
  onerror: SpeechRecognitionLike['onerror'] = null;
  onend: SpeechRecognitionLike['onend'] = null;
}

function harness(onFinal = vi.fn()) {
  const created: FakeRecognition[] = [];
  const hook = renderHook(() =>
    useSpeechRecognition({
      lang: 'fr-FR',
      onFinal,
      createRecognition: () => {
        const recognition = new FakeRecognition();
        created.push(recognition);
        return recognition;
      },
      timeoutMs: 12_000,
    }),
  );
  return { ...hook, created, onFinal };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('speech recognition', () => {
  it('reports when the browser has no speech API', () => {
    expect(speechRecognitionConstructor({})).toBeNull();
    const { result } = renderHook(() =>
      useSpeechRecognition({ lang: 'en-US', onFinal: vi.fn() }),
    );
    expect(result.current.supported).toBe(false);
    act(() => {
      result.current.start();
    });
    expect(result.current.listening).toBe(false);
  });

  it('detects a supported constructor', () => {
    class Supported extends FakeRecognition {}
    expect(
      speechRecognitionConstructor({ SpeechRecognition: Supported }),
    ).toBe(Supported);
    expect(
      speechRecognitionConstructor({ webkitSpeechRecognition: Supported }),
    ).toBe(Supported);
  });

  it('starts one session from the click, with final results only', () => {
    const { result, created } = harness();
    act(() => {
      result.current.start();
    });
    const recognition = created[0];
    expect(recognition).toBeDefined();
    expect(recognition?.start).toHaveBeenCalledTimes(1);
    expect(recognition?.continuous).toBe(false);
    expect(recognition?.interimResults).toBe(false);
    expect(recognition?.lang).toBe('fr-FR');
    expect(result.current.listening).toBe(true);

    act(() => {
      result.current.start();
    });
    expect(created).toHaveLength(1);
    expect(recognition?.start).toHaveBeenCalledTimes(1);
  });

  it('fills the transcript from a successful final result', () => {
    const { result, created, onFinal } = harness();
    act(() => {
      result.current.start();
    });
    act(() => {
      created[0]?.onresult?.({
        results: [[{ transcript: '  double   strike  ' }]],
      });
      created[0]?.onend?.();
    });
    expect(onFinal).toHaveBeenCalledWith('double strike');
    expect(result.current.listening).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('reports permission denial, silence, capture failure, and network errors', () => {
    for (const [browserCode, code] of [
      ['not-allowed', 'denied'],
      ['no-speech', 'no-speech'],
      ['audio-capture', 'audio-capture'],
      ['network', 'network'],
    ] as const) {
      const { result, created } = harness();
      act(() => {
        result.current.start();
      });
      act(() => {
        created[0]?.onerror?.({ error: browserCode });
      });
      expect(result.current.error).toBe(code);
      expect(result.current.listening).toBe(false);
    }
  });

  it('cancels and can start again, ignoring the cancelled transcript', () => {
    const { result, created, onFinal } = harness();
    act(() => {
      result.current.start();
    });
    const first = created[0];
    act(() => {
      result.current.stop();
    });
    expect(first?.abort).toHaveBeenCalled();
    expect(result.current.listening).toBe(false);

    act(() => {
      first?.onresult?.({ results: [[{ transcript: 'stale' }]] });
    });
    expect(onFinal).not.toHaveBeenCalled();

    act(() => {
      result.current.start();
    });
    expect(created).toHaveLength(2);
    expect(result.current.listening).toBe(true);
  });

  it('ignores results after unmount', () => {
    const { result, created, onFinal, unmount } = harness();
    act(() => {
      result.current.start();
    });
    const recognition = created[0];
    unmount();
    act(() => {
      recognition?.onresult?.({ results: [[{ transcript: 'too late' }]] });
    });
    expect(onFinal).not.toHaveBeenCalled();
    expect(recognition?.abort).toHaveBeenCalled();
  });

  it('times out a session that never hears speech', () => {
    vi.useFakeTimers();
    const { result, created, onFinal } = harness();
    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(12_000);
    });
    expect(result.current.error).toBe('timeout');
    expect(result.current.listening).toBe(false);
    expect(created[0]?.abort).toHaveBeenCalled();
    act(() => {
      created[0]?.onresult?.({ results: [[{ transcript: 'late' }]] });
    });
    expect(onFinal).not.toHaveBeenCalled();
  });
});
