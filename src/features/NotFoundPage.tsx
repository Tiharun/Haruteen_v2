import { Link } from 'react-router';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="페이지를 찾을 수 없어요" />
      <EmptyState
        title="주소가 잘못됐거나 없어진 페이지예요"
        action={<Link to="/">오늘로 가기</Link>}
      />
    </>
  );
}
