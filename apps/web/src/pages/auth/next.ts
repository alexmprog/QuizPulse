/** Control characters or a backslash anywhere: browsers drop tabs/newlines and read `\` as `/`, so `/\t/host` is `//host`. */
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\\]/;

/** The post-login target from `?next=`: only same-origin paths, never `//host`, `/\host` or one with control chars. */
export function safeNext(next: string | null): string {
    if (next?.startsWith('/') && !next.startsWith('//') && !UNSAFE.test(next)) return next;
    return '/studio';
}
