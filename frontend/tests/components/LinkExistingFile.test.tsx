import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LinkExistingFile } from '@/components/teacher/LinkExistingFile';
import { ToastProvider } from '@/components/ui/toast';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/fileLinks.api', () => ({ fileLinksApi: { list: vi.fn(), link: vi.fn() } }));
import { fileLinksApi } from '@/api/fileLinks.api';
const list = fileLinksApi.list as unknown as ReturnType<typeof vi.fn>;
const link = fileLinksApi.link as unknown as ReturnType<typeof vi.fn>;

const files = [
  { source: 'lesson', id: 'lf2', name: 'מצגת hooks', sizeBytes: '2048', courseName: 'React', lessonTopic: 'שיעור 2' },
  { source: 'course', id: 'cf1', name: 'סילבוס', sizeBytes: null, courseName: 'Node', lessonTopic: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue({ data: { data: { files } } });
});

function renderButton(onLinked = vi.fn()) {
  renderWithProviders(<ToastProvider><LinkExistingFile target="lesson" targetId="l9" onLinked={onLinked} /></ToastProvider>);
  return onLinked;
}

describe('LinkExistingFile', () => {
  it('lists the files on the site with where each one is, and searches them', async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole('button', { name: /קובץ שכבר קיים באתר/ }));
    expect(await screen.findByText('מצגת hooks')).toBeInTheDocument();
    expect(screen.getByText(/React · שיעור 2/)).toBeInTheDocument();
    expect(screen.getByText(/Node · קבצי הקורס/)).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith('lesson', 'l9');

    await user.type(screen.getByPlaceholderText(/חיפוש/), 'node');
    expect(screen.queryByText('מצגת hooks')).not.toBeInTheDocument();
    expect(screen.getByText('סילבוס')).toBeInTheDocument();
  });

  it('adds the chosen file to the lesson and refreshes it', async () => {
    link.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    const onLinked = renderButton();
    await user.click(screen.getByRole('button', { name: /קובץ שכבר קיים באתר/ }));
    await user.click(await screen.findByRole('button', { name: 'הוספת סילבוס' }));
    await waitFor(() => expect(link).toHaveBeenCalledWith('lesson', 'l9', files[1]));
    await waitFor(() => expect(onLinked).toHaveBeenCalled());
    expect(await screen.findByText(/"סילבוס" נוסף/)).toBeInTheDocument();
  });
});
