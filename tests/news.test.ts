import { describe, it, expect } from "vitest";
import { parseRss, isHighConfidence, stripSourceSuffix, decodeXmlEntities, makeId } from "../scripts/sync-news";

describe("isHighConfidence (false-positive filtering)", () => {
  it("accepts the exact full name", () => {
    expect(isHighConfidence("Balaraman Ravindran wins award").pass).toBe(true);
    expect(isHighConfidence("IIT Madras Prof. Balaraman Ravindran appointed to panel").pass).toBe(true);
  });

  it("accepts the short name only alongside institutional context", () => {
    expect(isHighConfidence("IIT Madras Prof B Ravindran appointed to UN panel").pass).toBe(true);
    expect(isHighConfidence("B. Ravindran discusses AI at WSAI event").pass).toBe(true);
  });

  it("rejects the short name with no institutional context (avoids unrelated namesakes)", () => {
    expect(isHighConfidence("B Ravindran opens new restaurant in Chennai").pass).toBe(false);
  });

  it("rejects headlines that don't mention the professor by name at all", () => {
    expect(isHighConfidence("IIT Madras hosts AI safety conclave").pass).toBe(false);
    expect(isHighConfidence("India's AI opportunity is bigger than another ChatGPT").pass).toBe(false);
  });
});

describe("decodeXmlEntities", () => {
  it("decodes common XML entities and CDATA", () => {
    expect(decodeXmlEntities("Tom &amp; Jerry")).toBe("Tom & Jerry");
    expect(decodeXmlEntities("<![CDATA[Hello]]>")).toBe("Hello");
  });
});

describe("stripSourceSuffix", () => {
  it("removes the trailing ' - Source Name' Google News appends", () => {
    expect(stripSourceSuffix("Some Headline - The Hindu", "The Hindu")).toBe("Some Headline");
  });

  it("leaves titles without a matching suffix unchanged", () => {
    expect(stripSourceSuffix("Some Headline", "The Hindu")).toBe("Some Headline");
  });
});

describe("makeId", () => {
  it("is deterministic for the same URL", () => {
    const url = "https://news.google.com/rss/articles/abc?oc=5";
    expect(makeId(url)).toBe(makeId(url));
  });

  it("normalizes tracking params so syndication-tagged URLs collapse to the same id", () => {
    const a = makeId("https://example.com/article?utm_source=twitter");
    const b = makeId("https://example.com/article?utm_source=facebook");
    expect(a).toBe(b);
  });

  it("produces different ids for genuinely different URLs", () => {
    expect(makeId("https://example.com/a")).not.toBe(makeId("https://example.com/b"));
  });
});

describe("parseRss", () => {
  const sampleXml = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>Prof. Balaraman Ravindran wins award - Example News</title>
    <link>https://news.google.com/rss/articles/abc?oc=5</link>
    <pubDate>Tue, 23 Jun 2026 07:00:00 GMT</pubDate>
    <source url="https://example.com">Example News</source>
  </item>
</channel></rss>`;

  it("extracts title, link, pubDate, and source from RSS items", () => {
    const items = parseRss(sampleXml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain("Balaraman Ravindran");
    expect(items[0].link).toBe("https://news.google.com/rss/articles/abc?oc=5");
    expect(items[0].sourceName).toBe("Example News");
  });

  it("returns an empty array for XML with no items", () => {
    expect(parseRss("<rss><channel></channel></rss>")).toEqual([]);
  });
});
