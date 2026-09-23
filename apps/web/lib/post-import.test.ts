import { describe, expect, it } from "vitest";

import { parseCsv, parseCsvRows, parsePasted, platformOf } from "./post-import";

describe("platformOf", () => {
  it("recognises the main platforms", () => {
    expect(platformOf("https://www.tiktok.com/@maya/video/1")).toBe("tiktok");
    expect(platformOf("https://instagram.com/p/abc")).toBe("instagram");
    expect(platformOf("https://youtu.be/xyz")).toBe("youtube");
    expect(platformOf("https://example.com/post")).toBe("other");
    expect(platformOf(null)).toBeNull();
  });
});

describe("parsePasted", () => {
  it("reads URL + caption on one line, with an optional date", () => {
    const { posts } = parsePasted(
      "https://www.tiktok.com/@maya/video/1 2026-08-01 | obsessed with @theordinary niacinamide",
    );
    expect(posts).toEqual([
      {
        url: "https://www.tiktok.com/@maya/video/1",
        platform: "tiktok",
        postedAt: "2026-08-01",
        caption: "obsessed with @theordinary niacinamide",
      },
    ]);
  });

  it("collects multi-line captions until the next URL", () => {
    const { posts } = parsePasted(
      [
        "https://instagram.com/p/1",
        "morning routine ☀️",
        "cerave cleanser forever",
        "",
        "https://instagram.com/p/2 gym fit #gymshark",
      ].join("\n"),
    );
    expect(posts.map((p) => p.caption)).toEqual([
      "morning routine ☀️\ncerave cleanser forever",
      "gym fit #gymshark",
    ]);
  });

  it("drops duplicates and captionless posts, and reports stray text", () => {
    const r = parsePasted("hello\nhttps://x.com/1 a\nhttps://x.com/1 b\nhttps://x.com/2");
    expect(r.posts.map((p) => p.caption)).toEqual(["a"]);
    expect(r.skipped).toEqual([{ line: 1, reason: "Text before the first post link" }]);
  });
});

describe("CSV", () => {
  it("handles quotes, escaped quotes, commas and newlines in fields", () => {
    const rows = parseCsvRows('a,b\n"x, y","say ""hi""\nthere"\r\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"\nthere'],
    ]);
  });

  it("maps url, posted_at and caption columns in any order", () => {
    const { posts } = parseCsv(
      'caption,Posted At,URL\n"love my @glossier balm, again",2026-07-04,https://tiktok.com/@m/video/9\n',
    );
    expect(posts).toEqual([
      {
        url: "https://tiktok.com/@m/video/9",
        platform: "tiktok",
        postedAt: "2026-07-04",
        caption: "love my @glossier balm, again",
      },
    ]);
  });

  it("requires a caption column and skips empty captions", () => {
    expect(parseCsv("url\nhttps://a.com").skipped[0].reason).toContain("caption");
    const r = parseCsv("url,caption\nhttps://a.com/1,\nhttps://a.com/2,ok");
    expect(r.posts).toHaveLength(1);
    expect(r.skipped).toEqual([{ line: 2, reason: "Empty caption" }]);
  });
});
