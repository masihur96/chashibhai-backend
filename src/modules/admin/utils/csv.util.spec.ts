import { escapeCsvValue, generateCsv, CsvColumn } from './csv.util';

describe('CsvUtil', () => {
  describe('escapeCsvValue', () => {
    it('should return empty string for null and undefined', () => {
      expect(escapeCsvValue(null)).toBe('');
      expect(escapeCsvValue(undefined)).toBe('');
    });

    it('should return simple text without quotes', () => {
      expect(escapeCsvValue('SimpleText')).toBe('SimpleText');
      expect(escapeCsvValue(1234)).toBe('1234');
    });

    it('should escape strings containing commas', () => {
      expect(escapeCsvValue('Mirpur, Dhaka')).toBe('"Mirpur, Dhaka"');
    });

    it('should escape strings containing double quotes', () => {
      expect(escapeCsvValue('A "quoted" text')).toBe('"A ""quoted"" text"');
    });

    it('should escape strings containing newlines', () => {
      expect(escapeCsvValue("Line1\nLine2")).toBe("\"Line1\nLine2\"");
    });
  });

  describe('generateCsv', () => {
    it('should serialize objects into CSV string with custom formatting', () => {
      interface TestItem {
        id: string;
        name: string;
        amount: number;
        extra?: any;
      }

      const columns: CsvColumn<TestItem>[] = [
        { header: 'ID', key: 'id' },
        { header: 'Name', key: 'name' },
        { header: 'Amount', key: 'amount' },
        {
          header: 'Formatted Extra',
          key: 'extra',
          format: (v) => (v ? v.tag : 'N/A'),
        },
      ];

      const data: TestItem[] = [
        { id: '1', name: 'Item One, Red', amount: 50.5, extra: { tag: 'VIP' } },
        { id: '2', name: 'Item "Two"', amount: 100 },
      ];

      const csv = generateCsv(data, columns);

      expect(csv).toContain('ID,Name,Amount,Formatted Extra');
      expect(csv).toContain('1,"Item One, Red",50.5,VIP');
      expect(csv).toContain('2,"Item ""Two""",100,N/A');
    });
  });
});
