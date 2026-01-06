// Get a reference to the global DataTransformer module and assign it to a shorter alias (DT)
// This makes it easier to call conversion functions throughout the tests
const DT = global.DataTransformer;

// Sample input objects used for testing JSON structure round-trips
const sampleObj = {
  name: "John",
  age: 30,
  address: { city: "Sofia" },
};

const sampleObj2 = {
  product: "Shoes",
  price: 59.99,
  details: {
    color: "Red",
    size: 42,
  },
};

describe("DataTransformer.convert – round-trip sanity", () => {
  it("JSON -> YAML -> JSON should keep structure", async () => {
    const { result: yaml } = await DT.convert(
      JSON.stringify(sampleObj),
      `
      inputformat=json
      outputformat=yaml
      align=true
    `
    );

    const { result: backToJson } = await DT.convert(
      yaml,
      `
      inputformat=yaml
      outputformat=json
      align=false
    `
    );

    expect(JSON.parse(backToJson)).toEqual(sampleObj);
  });

  it("JSON -> XML -> JSON should keep structure (root wrapper ignored)", async () => {
    const { result: xml } = await DT.convert(
      JSON.stringify(sampleObj),
      `
      inputformat=json
      outputformat=xml
    `
    );

    const { result: json } = await DT.convert(
      xml,
      `
      inputformat=xml
      outputformat=json
    `
    );

    const parsed = JSON.parse(json);
    const normalized = JSON.parse(
      JSON.stringify(parsed.root ?? parsed),
      (k, v) => (typeof v === "string" && !isNaN(v) ? Number(v) : v)
    );
    expect(normalized).toEqual(sampleObj);
  });

  it("JSON -> CSV -> JSON round-trip", async () => {
    const { result: csv } = await DT.convert(
      JSON.stringify(sampleObj),
      `
      inputformat=json
      outputformat=csv
    `
    );

    const { result: json } = await DT.convert(
      csv,
      `
      inputformat=csv
      outputformat=json
    `
    );

    expect(JSON.parse(json)).toEqual(sampleObj);
  });

  it("JSON to Emmet conversion keeps leaf values (alt object)", async () => {
    const emmet = DT.jsonToEmmet(sampleObj2);
    const json = JSON.stringify(DT.emmetToJSON(emmet));

    expect(JSON.parse(json)).toEqual(sampleObj2);
  });
});

describe("Options / mutations", () => {
  it("Tag & value replacement works", async () => {
    const { result } = await DT.convert(
      JSON.stringify(sampleObj),
      `
      inputformat=json
      outputformat=json
      replace.tag.name=firstName
      replace.val.Sofia=Plovdiv
      align=false
    `
    );

    const parsed = JSON.parse(result);
    expect(parsed.firstName ?? parsed.name).toBe("John");
    expect(parsed.address?.city).toBe("Plovdiv");
  });
});

describe("detectFormat()", () => {
  it("recognises the four supported syntaxes and unknown input", () => {
    expect(DT.detectFormat('{"a":1}')).toBe("json"); // JSON branch
    expect(DT.detectFormat("---\na: 1\n")).toBe("yaml"); // YAML branch
    expect(DT.detectFormat("<root></root>")).toBe("xml"); // XML branch
    expect(DT.detectFormat("a,b\n1,2")).toBe("csv"); // CSV branch
    expect(DT.detectFormat("   ")).toBe("unknown"); // empty branch
  });
});

describe("case-conversion option (camel -> snake)", () => {
  const obj = { firstName: 1, nested: { childKey: 2 } };

  it("converts keys to snake_case", async () => {
    const { result } = await DT.convert(
      JSON.stringify(obj),
      `
      inputformat=json
      outputformat=json
      case=snake
      align=false
    `
    );
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("first_name");
    expect(parsed.nested).toHaveProperty("child_key");
  });
});

describe("Emmet parser – ‘*N’ repetition", () => {
  it("parses li*3 into an array of three empty objects", async () => {
    const emmet = "li*3";
    const { result } = await DT.convert(
      emmet,
      `
      inputformat=emmet
      outputformat=json
      align=false
    `
    );
    expect(JSON.parse(result)).toEqual({ li: [{}, {}, {}] });
  });
});

describe("transformKeys() deep recursion", () => {
  const deep = { levelOne: { levelTwo: { levelThree: 5 } } };

  it("recursively upper-cases every key", async () => {
    const { result } = await DT.convert(
      JSON.stringify(deep),
      `
      inputformat=json
      outputformat=json
      case=upper
      align=false
    `
    );
    expect(JSON.parse(result)).toEqual({
      LEVELONE: { LEVELTWO: { LEVELTHREE: 5 } },
    });
  });
});

it("parses nested Emmet with repetition (ul>li*2)", async () => {
  const emmet = "ul>li*2";
  const { result } = await DT.convert(
    emmet,
    `
    inputformat=emmet
    outputformat=json
    align=false
  `
  );
  expect(JSON.parse(result)).toEqual({
    ul: { li: [{}, {}] },
  });
});

it("parses grouped siblings correctly", async () => {
  const emmet = "ul>(li{One}+li{Two})";
  const { result } = await DT.convert(
    emmet,
    `
    inputformat=emmet
    outputformat=json
    align=false
  `
  );
  expect(JSON.parse(result)).toEqual({
    ul: {
      li: ["One", "Two"],
    },
  });
});

it("replaces values even if they look numeric", async () => {
  const obj = { score: "10" };
  const { result } = await DT.convert(
    JSON.stringify(obj),
    `
    inputformat=json
    outputformat=json
    replace.val.10=Passed
    align=false
  `
  );
  expect(JSON.parse(result).score).toBe("Passed");
});

it("unwraps single #text node from XML", async () => {
  const xml = "<root><name>John</name></root>";
  const { result } = await DT.convert(
    xml,
    `
    inputformat=xml
    outputformat=json
    align=false
  `
  );
  expect(JSON.parse(result).root.name).toBe("John");
});

it("flattens and restores nested JSON structure through CSV", async () => {
  const obj = { person: { name: "John", age: 30 } };
  const { result: csv } = await DT.convert(
    JSON.stringify(obj),
    `
    inputformat=json
    outputformat=csv
  `
  );
  const { result: json } = await DT.convert(
    csv,
    `
    inputformat=csv
    outputformat=json
  `
  );
  expect(JSON.parse(json)).toEqual(obj);
});

it("throws an error when input format cannot be detected", async () => {
  await expect(
    DT.convert(
      "   ",
      `
      inputformat=auto
      outputformat=json
    `
    )
  ).rejects.toThrow(/не може да се определи/i);
});

it("jsonToEmmet – handles arrays of primitives, objects, and empty objects", () => {
  const input = {
    li: [
      "Item 1", // primitive
      {}, // empty object
      { span: "Nested" }, // nested object
    ],
  };

  const emmet = DT.jsonToEmmet(input);
  expect(emmet).toBe("li{Item 1}+li+li>span{Nested}");
});

it("jsonToEmmet – handles root-level array", () => {
  const input = [{ a: 1 }, { b: 2 }];

  const emmet = DT.jsonToEmmet(input);
  expect(emmet).toBe("a{1}+b{2}");
});

it("emmetToJSON – merges repeated siblings into array", () => {
  const emmet = "li{One}+li{Two}";
  const json = DT.emmetToJSON(emmet);

  expect(json).toEqual({ li: ["One", "Two"] });
});

it("convert – reindents JSON if input and output are json with align=true", async () => {
  const minified = '{"foo":1,"bar":2}';
  const { result } = await DT.convert(
    minified,
    "inputformat=json\noutputformat=json\nalign=true"
  );
  expect(result).toBe(JSON.stringify({ foo: 1, bar: 2 }, null, 2));
});

it("emmetToJSON – handles nested children with multiple '>'", () => {
  const emmet = "div>section>article{News}";
  const json = DT.emmetToJSON(emmet);

  expect(json).toEqual({
    div: {
      section: {
        article: "News",
      },
    },
  });
});

it("mergeJSON – merges same-key objects into array", () => {
  const a = { user: { name: "Alice" } };
  const b = { user: { name: "Bob" } };
  const merged = DT.__testonly.mergeJSON(a, b);

  expect(merged).toEqual({
    user: [{ name: "Alice" }, { name: "Bob" }],
  });
});

it("jsonToXML – renders arrays as repeated tags", () => {
  const input = { item: ["A", "B"] };
  const xml = DT.jsonToXML(input);

  expect(xml).toContain("<item>A</item>");
  expect(xml).toContain("<item>B</item>");
});
