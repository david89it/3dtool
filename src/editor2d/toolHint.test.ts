import { describe, expect, it } from 'vitest';
import { toolHintText, type HintState } from './toolHint';
import { deletedWording } from '../model/store';

const base: HintState = { tool: 'select', mode: 'trace', selected: null, drawing: false, emptyFloor: false, touch: false };

describe('toolHintText', () => {
  it('says how to start and how to finish a wall', () => {
    expect(toolHintText({ ...base, tool: 'draw' })).toMatch(/start a wall/i);
    expect(toolHintText({ ...base, tool: 'draw', drawing: true })).toMatch(/double-click/i);
  });
  it('talks about taps on a touch screen', () => {
    expect(toolHintText({ ...base, tool: 'draw', drawing: true, touch: true })).toMatch(/double-tap/i);
    expect(toolHintText({ ...base, tool: 'draw', drawing: true, touch: true })).not.toMatch(/click/i);
  });
  it('follows the selection', () => {
    expect(toolHintText({ ...base, mode: 'furnish', selected: 'item' })).toMatch(/buttons above/i);
    expect(toolHintText({ ...base, selected: 'wall' })).toMatch(/wall/i);
  });
  it('points an empty floor back to Trace outside Trace', () => {
    expect(toolHintText({ ...base, mode: 'furnish', emptyFloor: true })).toMatch(/draw the walls first/i);
  });
});

describe('deletedWording', () => {
  it('announces removals in the past tense and ignores other steps', () => {
    expect(deletedWording('Remove 3-seat sofa')).toBe('Removed 3-seat sofa');
    expect(deletedWording('Delete wall')).toBe('Deleted wall');
    expect(deletedWording('Move sofa')).toBeNull();
  });
});
