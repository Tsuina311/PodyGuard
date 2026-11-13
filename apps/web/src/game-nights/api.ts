import type {
  GameNight,
  GameNightInput,
  NightRsvp,
  NightView,
} from '@podyguard/shared';
import { request } from '../api';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
export const listNights = (group: string, token: string) =>
  request<{ nights: GameNight[] }>(
    `/playgroups/${encodeURIComponent(group)}/nights`,
    { headers: auth(token) },
  );
export const createNight = (
  group: string,
  token: string,
  input: GameNightInput,
) =>
  request<{ night: GameNight }>(
    `/playgroups/${encodeURIComponent(group)}/nights`,
    { method: 'POST', headers: auth(token), body: JSON.stringify(input) },
  );
export const getNight = (id: string) =>
  request<NightView>(`/nights/${encodeURIComponent(id)}`);
export const rsvpNight = (id: string, rsvpToken: string, response: NightRsvp) =>
  request(`/nights/${encodeURIComponent(id)}/rsvp`, {
    method: 'POST',
    body: JSON.stringify({ ...response, rsvpToken }),
  });
export const cancelNight = (id: string, token: string) =>
  request(`/nights/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    headers: auth(token),
  });
export const startNight = (id: string, token: string, hostPin: string) =>
  request<{
    event: import('@podyguard/shared').PublicEvent;
    hostToken: string;
  }>(`/nights/${encodeURIComponent(id)}/start`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({ hostPin }),
  });
