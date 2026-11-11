import { describe, expect, it } from 'vitest'
import { acceptConflict, parseConflicts, resolveConflict } from '../../../app/utils/conflicts'

const block = (ours: string, theirs: string, end = '\n') =>
  `<<<<<<< HEAD\n${ours}=======\n${theirs}>>>>>>> feature/footer${end}`

const footer = `before\n${block('open daily\n', 'hello@juniper\n')}after\n`

describe('parseConflicts', () => {
  it('finds nothing in a clean file', () => {
    expect(parseConflicts('a\nb\n')).toEqual([])
    expect(parseConflicts('')).toEqual([])
  })

  it('finds one block with its ranges, labels and lines', () => {
    const [found, ...rest] = parseConflicts(footer)
    expect(rest).toEqual([])
    expect(found).toBeDefined()
    expect(footer.slice(found!.from, found!.to)).toBe(block('open daily\n', 'hello@juniper\n'))
    expect(footer.slice(found!.ours.from, found!.ours.to)).toBe('open daily\n')
    expect(footer.slice(found!.theirs.from, found!.theirs.to)).toBe('hello@juniper\n')
    expect(found!.base).toBeNull()
    expect(found!.oursLabel).toBe('HEAD')
    expect(found!.theirsLabel).toBe('feature/footer')
    expect([found!.startLine, found!.separatorLine, found!.endLine]).toEqual([1, 3, 5])
  })

  it('finds several blocks in order', () => {
    const text = `${block('a\n', 'b\n')}middle\n${block('c\n', 'd\n')}`
    const found = parseConflicts(text)
    expect(found).toHaveLength(2)
    expect(text.slice(found[1]!.ours.from, found[1]!.ours.to)).toBe('c\n')
  })

  it('reads a diff3 base section', () => {
    const text = '<<<<<<< HEAD\nours\n||||||| base\norig\n=======\ntheirs\n>>>>>>> topic\n'
    const [found] = parseConflicts(text)
    expect(text.slice(found!.ours.from, found!.ours.to)).toBe('ours\n')
    expect(text.slice(found!.base!.from, found!.base!.to)).toBe('orig\n')
    expect(text.slice(found!.theirs.from, found!.theirs.to)).toBe('theirs\n')
    expect(found!.baseLine).toBe(2)
  })

  it('handles a block at the end of a file without a final line break', () => {
    const text = block('a\n', 'b\n', '')
    const [found] = parseConflicts(text)
    expect(found!.to).toBe(text.length)
  })

  it('handles empty sides', () => {
    const text = block('', 'b\n')
    const [found] = parseConflicts(text)
    expect(found!.ours.from).toBe(found!.ours.to)
  })

  it('ignores blocks that are not complete after hand edits', () => {
    expect(parseConflicts('<<<<<<< HEAD\na\n=======\nb\n')).toEqual([])
    expect(parseConflicts('<<<<<<< HEAD\na\n>>>>>>> x\n')).toEqual([])
    expect(parseConflicts('a\n=======\nb\n>>>>>>> x\n')).toEqual([])
  })

  it('starts over at a second opening marker', () => {
    const text = `<<<<<<< HEAD\nstray\n${block('a\n', 'b\n')}`
    const found = parseConflicts(text)
    expect(found).toHaveLength(1)
    expect(found[0]!.startLine).toBe(2)
  })

  it('needs exactly seven marker characters at the start of the line', () => {
    expect(parseConflicts('<<<<<<<< HEAD\na\n=======\nb\n>>>>>>> x\n')).toEqual([])
    expect(parseConflicts(' <<<<<<< HEAD\na\n=======\nb\n>>>>>>> x\n')).toEqual([])
    expect(parseConflicts('<<<<<<<\na\n=======\nb\n>>>>>>>\n')).toHaveLength(1)
  })

  it('accepts Windows line breaks', () => {
    const text = '<<<<<<< HEAD\r\na\r\n=======\r\nb\r\n>>>>>>> x\r\n'
    expect(parseConflicts(text)).toHaveLength(1)
  })
})

describe('accept actions', () => {
  it('accept current keeps our lines', () => {
    expect(acceptConflict(footer, 0, 'current')).toBe('before\nopen daily\nafter\n')
  })

  it('accept incoming keeps their lines', () => {
    expect(acceptConflict(footer, 0, 'incoming')).toBe('before\nhello@juniper\nafter\n')
  })

  it('accept both keeps ours, then theirs', () => {
    expect(acceptConflict(footer, 0, 'both')).toBe('before\nopen daily\nhello@juniper\nafter\n')
  })

  it('resolves only the chosen block', () => {
    const text = `${block('a\n', 'b\n')}${block('c\n', 'd\n')}`
    const once = acceptConflict(text, 1, 'incoming')
    expect(once).toBe(`${block('a\n', 'b\n')}d\n`)
    expect(acceptConflict(once, 0, 'current')).toBe('a\nd\n')
  })

  it('keeps a missing final line break missing', () => {
    expect(acceptConflict(`x\n${block('a\n', 'b\n', '')}`, 0, 'both')).toBe('x\na\nb')
  })

  it('drops the base section of a diff3 block', () => {
    const text = '<<<<<<< HEAD\nours\n||||||| base\norig\n=======\ntheirs\n>>>>>>> topic\n'
    expect(acceptConflict(text, 0, 'both')).toBe('ours\ntheirs\n')
  })

  it('removes the block entirely when the kept side is empty', () => {
    expect(acceptConflict(`x\n${block('', 'b\n')}y\n`, 0, 'current')).toBe('x\ny\n')
  })

  it('leaves the text alone for an unknown block', () => {
    expect(acceptConflict(footer, 3, 'both')).toBe(footer)
  })

  it('resolveConflict works on a parsed block', () => {
    const [found] = parseConflicts(footer)
    expect(resolveConflict(footer, found!, 'current')).toBe('before\nopen daily\nafter\n')
  })
})
