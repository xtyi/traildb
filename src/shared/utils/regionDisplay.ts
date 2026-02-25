const SHORT_NAME_BY_CODE: Record<string, string> = {
  "110000": "北京",
  "120000": "天津",
  "310000": "上海",
  "810000": "香港",
  "820000": "澳门",
};

export function getRegionDisplayName(name: string, code?: string): string {
  if (code && SHORT_NAME_BY_CODE[code]) {
    return SHORT_NAME_BY_CODE[code];
  }

  return name;
}

export function shouldHideCountryLabel(code: string): boolean {
  return Boolean(SHORT_NAME_BY_CODE[code]);
}
