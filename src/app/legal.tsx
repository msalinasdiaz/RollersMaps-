import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Text } from 'react-native';
import { Button, Card, Screen, ui } from '@/components/community-ui';
import { useDemoSession } from '@/contexts/demo-session';
import { LEGAL_CONTACT, legalDocuments, type LegalSection } from '@/lib/legal';
import { acceptCurrentTerms } from '@/lib/moderation';

export default function LegalScreen() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const selected: LegalSection = section === 'terms' || section === 'deletion' ? section : 'privacy';
  const document = legalDocuments[selected]; const { user } = useDemoSession();
  const [busy, setBusy] = useState(false);const [message, setMessage] = useState<string | null>(null);
  const accept = async () => { if(busy)return;setBusy(true);setMessage(null);try { await acceptCurrentTerms();setMessage('Aceptación guardada. Ya puedes publicar contenido.'); } catch(error) {setMessage(error instanceof Error ? error.message : 'No pudimos guardar tu aceptación.');} finally{setBusy(false);} };
  return <Screen title={document.title} back>
    <Button secondary onPress={() => router.setParams({section:'privacy'})}>Privacidad</Button>
    <Button secondary onPress={() => router.setParams({section:'terms'})}>Términos y comunidad</Button>
    <Button secondary onPress={() => router.setParams({section:'deletion'})}>Eliminación de cuenta</Button>
    {document.paragraphs.map((paragraph,index)=><Card key={index}><Text style={ui.text}>{paragraph}</Text></Card>)}
    {selected==='terms'&&user?<Button busy={busy} onPress={()=>void accept()}>He leído y acepto estas reglas</Button>:null}
    {message?<Text accessibilityLiveRegion="polite" style={ui.muted}>{message}</Text>:null}
    <Button secondary onPress={()=>void Linking.openURL(`mailto:${LEGAL_CONTACT}`)}>Contactar soporte</Button>
  </Screen>;
}
