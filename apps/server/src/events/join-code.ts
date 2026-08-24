import { randomInt } from 'node:crypto';
import {
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
} from '@podyguard/shared';

export function generateJoinCode(): string {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i += 1) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}
