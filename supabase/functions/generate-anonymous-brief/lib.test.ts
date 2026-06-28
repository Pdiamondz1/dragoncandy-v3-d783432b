import { describe, it, expect } from 'vitest';
import {
  isHoneypotTripped,
  isValidInet,
  extractClientIp,
  isBlockedTarget,
  extractContent,
  computeSourceQuality,
  parseBrief,
} from './lib';

describe('isHoneypotTripped', () => {
  it('trips on a non-empty decoy', () => {
    expect(isHoneypotTripped({ subject_hp: 'bot@x.com' })).toBe(true);
  });
  it('does not trip on empty / whitespace / missing', () => {
    expect(isHoneypotTripped({ subject_hp: '' })).toBe(false);
    expect(isHoneypotTripped({ subject_hp: '   ' })).toBe(false);
    expect(isHoneypotTripped({})).toBe(false);
    expect(isHoneypotTripped(null)).toBe(false);
  });
});

describe('isValidInet', () => {
  it('accepts valid IPv4', () => {
    expect(isValidInet('203.0.113.7')).toBe(true);
    expect(isValidInet('8.8.8.8')).toBe(true);
  });
  it('rejects malformed IPv4', () => {
    expect(isValidInet('999.1.1.1')).toBe(false);
    expect(isValidInet('1.2.3')).toBe(false);
    expect(isValidInet('not-an-ip')).toBe(false);
    expect(isValidInet('')).toBe(false);
  });
  it('accepts loose IPv6', () => {
    expect(isValidInet('2001:db8::1')).toBe(true);
  });
});

describe('extractClientIp', () => {
  const make = (h: Record<string, string>) => (n: string) => h[n] ?? null;
  it('prefers cf-connecting-ip', () => {
    expect(extractClientIp(make({ 'cf-connecting-ip': '203.0.113.7', 'x-real-ip': '198.51.100.2' }))).toBe('203.0.113.7');
  });
  it('falls back to x-real-ip then first XFF entry', () => {
    expect(extractClientIp(make({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(extractClientIp(make({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9');
  });
  it('returns null when nothing parses to a valid inet', () => {
    expect(extractClientIp(make({ 'x-forwarded-for': 'garbage' }))).toBeNull();
    expect(extractClientIp(make({}))).toBeNull();
  });
});

describe('isBlockedTarget (SSRF guard)', () => {
  it('allows ordinary public http(s) URLs', () => {
    expect(isBlockedTarget('https://www.shakeshack.com')).toBe(false);
    expect(isBlockedTarget('http://example.com/menu')).toBe(false);
  });
  it('blocks non-http(s) schemes', () => {
    expect(isBlockedTarget('file:///etc/passwd')).toBe(true);
    expect(isBlockedTarget('ftp://example.com')).toBe(true);
    expect(isBlockedTarget('gopher://x')).toBe(true);
  });
  it('blocks IPv4 private / loopback / link-local', () => {
    expect(isBlockedTarget('http://127.0.0.1/')).toBe(true);
    expect(isBlockedTarget('http://10.0.0.5/')).toBe(true);
    expect(isBlockedTarget('http://172.16.0.1/')).toBe(true);
    expect(isBlockedTarget('http://192.168.1.1/')).toBe(true);
    expect(isBlockedTarget('http://169.254.169.254/latest/meta-data/')).toBe(true);
    expect(isBlockedTarget('http://0.0.0.0/')).toBe(true);
  });
  it('blocks numeric host encodings (decimal / hex / octal)', () => {
    expect(isBlockedTarget('http://2130706433/')).toBe(true); // 127.0.0.1
    expect(isBlockedTarget('http://0x7f000001/')).toBe(true);
    expect(isBlockedTarget('http://017700000001/')).toBe(true);
  });
  it('blocks malformed dotted-quad (octet > 255)', () => {
    expect(isBlockedTarget('http://999.1.1.1/')).toBe(true);
  });
  it('blocks IPv6 loopback / ULA / link-local / mapped-private', () => {
    expect(isBlockedTarget('http://[::1]/')).toBe(true);
    expect(isBlockedTarget('http://[fc00::1]/')).toBe(true);
    expect(isBlockedTarget('http://[fe80::1]/')).toBe(true);
    expect(isBlockedTarget('http://[::ffff:127.0.0.1]/')).toBe(true);
  });
  it('blocks obvious internal hostnames', () => {
    expect(isBlockedTarget('http://localhost/')).toBe(true);
    expect(isBlockedTarget('http://metadata.google.internal/')).toBe(true);
    expect(isBlockedTarget('http://db.internal/')).toBe(true);
  });
  it('blocks an unparseable URL', () => {
    expect(isBlockedTarget('not a url')).toBe(true);
  });
});

describe('extractContent', () => {
  it('pulls title, meta description, and stripped body', () => {
    const html = `<html><head><title> Joe's Diner </title><meta name="description" content="Best burgers"></head><body><script>var x=1</script><h1>Welcome</h1><p>Great food</p></body></html>`;
    const r = extractContent(html);
    expect(r.title).toBe("Joe's Diner");
    expect(r.description).toBe('Best burgers');
    expect(r.bodyText).toContain('Welcome');
    expect(r.bodyText).toContain('Great food');
    expect(r.bodyText).not.toContain('var x=1');
  });
  it('handles missing title/description', () => {
    const r = extractContent('<html><body>hi</body></html>');
    expect(r.title).toBe('');
    expect(r.description).toBe('');
    expect(r.bodyText).toBe('hi');
  });
});

describe('computeSourceQuality', () => {
  it('readable when fetch ok and over threshold', () => {
    expect(computeSourceQuality('x'.repeat(250), true)).toEqual({ readable: true, chars: 250 });
  });
  it('not readable when thin', () => {
    expect(computeSourceQuality('short', true)).toEqual({ readable: false, chars: 5 });
  });
  it('not readable when fetch failed even if long', () => {
    expect(computeSourceQuality('x'.repeat(250), false)).toEqual({ readable: false, chars: 250 });
  });
});

describe('parseBrief', () => {
  it('parses raw JSON', () => {
    const b = parseBrief('{"campaign_name":"Spring Launch","content_suggestions":["a","b"]}');
    expect(b.campaign_name).toBe('Spring Launch');
    expect(b.content_suggestions).toEqual(['a', 'b']);
  });
  it('strips ```json fences', () => {
    const b = parseBrief('```json\n{"campaign_name":"X"}\n```');
    expect(b.campaign_name).toBe('X');
  });
  it('throws on garbage', () => {
    expect(() => parseBrief('not json')).toThrow();
  });
  it('throws on a non-object JSON value', () => {
    expect(() => parseBrief('[1,2,3]')).toThrow();
  });
});
