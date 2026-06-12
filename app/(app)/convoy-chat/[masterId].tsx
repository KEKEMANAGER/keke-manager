import { useLocalSearchParams, useRouter } from 'expo-router';
import { ConvoyChatContent } from '../../../components/ConvoyChatContent';

export default function CompanyConvoyChatScreen() {
  const router = useRouter();
  const { masterId } = useLocalSearchParams<{ masterId: string }>();
  const id = String(masterId ?? '').trim();

  if (!id) {
    router.back();
    return null;
  }

  return <ConvoyChatContent masterId={id} onClose={() => router.back()} />;
}
