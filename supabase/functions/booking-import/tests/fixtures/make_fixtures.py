# Builds the importer's test documents (python3 make_fixtures.py, needs
# reportlab, python-docx and openpyxl). Nothing here is real data: every name,
# phone number and group is invented.
import io, os, zipfile, random
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
import docx
from docx.shared import Pt
import openpyxl

OUT = os.path.dirname(os.path.abspath(__file__)) + '/'
pdfmetrics.registerFont(TTFont('DV', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DVB', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
P = ParagraphStyle('p', fontName='DV', fontSize=9.5, leading=12)
H = ParagraphStyle('h', fontName='DVB', fontSize=13, leading=16)

# ---- A: 8-day programme, English, header block + day table, 2 pages ---------
def doc_a():
    d = SimpleDocTemplate(OUT + 'programme_8_days_en.pdf', pagesize=A4, leftMargin=40, rightMargin=40)
    s = [Paragraph('SILK ROAD TRAVEL LLC — TRANSPORT REQUEST', H),
         Paragraph('Programme: GEORGIA DISCOVERY 8D/7N &nbsp;&nbsp; Group code: NL-2611', P), Spacer(1, 8)]
    head = [
        ['Group:', 'Van der Berg family & friends (Netherlands)'],
        ['Pax:', '12 adults + 2 children (ages 4 and 7)'],
        ['Luggage:', '16 large suitcases, 2 strollers'],
        ['Vehicle:', 'Mercedes Sprinter (19 seats) with luggage trailer'],
        ['Driver:', 'English-speaking, same driver for the whole programme'],
        ['Price:', '2,450 USD, fuel included, driver accommodation by us'],
        ['Lead passenger:', 'Pieter van der Berg, +31 6 1234 5678'],
    ]
    t = Table(head, colWidths=[110, 400])
    t.setStyle(TableStyle([('FONT', (0, 0), (-1, -1), 'DV', 9.5)]))
    s += [t, Spacer(1, 10)]
    rows = [['Day', 'Date', 'Programme', 'Overnight']]
    prog = [
        ('1', '12.11.2026', 'Arrival TBS, flight KL 3150 lands 03:40. Meet & greet with sign "NL-2611". Transfer to hotel.', 'Tbilisi – Hotel Stamba'),
        ('2', '13.11.2026', 'Tbilisi city tour: Old Town, Narikala, Sulphur baths, Dry Bridge. Start 10:00.', 'Tbilisi – Hotel Stamba'),
        ('3', '14.11.2026', 'Tbilisi – Sighnaghi – Bodbe – Telavi, wine tasting. Start 09:00.', 'Telavi – Schuchmann Wines Chateau'),
        ('4', '15.11.2026', 'Telavi – Gombori pass – Ananuri – Gudauri – Stepantsminda, Gergeti Trinity.', 'Stepantsminda – Rooms Hotel Kazbegi'),
        ('5', '16.11.2026', 'Stepantsminda – Mtskheta – Uplistsikhe – Kutaisi.', 'Kutaisi – Hotel Newport'),
        ('6', '17.11.2026', 'Prometheus Cave – Martvili Canyon – Batumi.', 'Batumi – Hilton Batumi'),
        ('7', '18.11.2026', 'Free day in Batumi, no transport needed.', 'Batumi – Hilton Batumi'),
        ('8', '19.11.2026', 'Departure: pickup 03:30 at Hilton Batumi to Batumi airport, flight TK 7795 at 06:10.', '—'),
    ]
    for r in prog:
        rows.append([r[0], r[1], Paragraph(r[2], P), Paragraph(r[3], P)])
    t2 = Table(rows, colWidths=[30, 70, 280, 140], repeatRows=1)
    t2.setStyle(TableStyle([('FONT', (0, 0), (-1, -1), 'DV', 9.5), ('GRID', (0, 0), (-1, -1), 0.4, colors.grey),
                            ('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    s += [t2, Spacer(1, 12), Paragraph('Please confirm availability and send the driver details 3 days before arrival.', P)]
    d.build(s)

# ---- H: Georgian one-page form, labels beside values ------------------------
def doc_h():
    d = SimpleDocTemplate(OUT + 'day_tour_form_ka.pdf', pagesize=A4, leftMargin=50, rightMargin=50)
    s = [Paragraph('შპს „კავკასიური მოგზაურობა“ — ტრანსპორტის მოთხოვნა', H), Spacer(1, 10)]
    rows = [
        ['სერვისი', 'ერთდღიანი ტური'],
        ['თარიღი', '21.11.2026'],
        ['აყვანის დრო', '07:30'],
        ['საიდან', 'სასტუმრო რუმსი, თბილისი'],
        ['მარშრუტი', 'ჟინვალი – ანანური – გუდაური – სტეფანწმინდა – გერგეთის სამება'],
        ['სად', 'სასტუმრო რუმსი, თბილისი'],
        ['მგზავრები', '2 ზრდასრული და 1 ბავშვი (ბავშვის სავარძელი საჭიროა)'],
        ['ავტომობილი', 'სედანი, კომფორტი'],
        ['ფასი', '300 ლარი'],
        ['სტუმარი', 'Anna Schmidt'],
        ['ტელეფონი', '+49 151 2345 6789'],
        ['კომენტარი', 'ინგლისურენოვანი მძღოლი; გუდაურში ლანჩი 13:00-ზე'],
    ]
    t = Table(rows, colWidths=[130, 360])
    t.setStyle(TableStyle([('FONT', (0, 0), (-1, -1), 'DV', 10), ('GRID', (0, 0), (-1, -1), 0.4, colors.grey)]))
    s.append(t)
    d.build(s)

# ---- C: Russian order form (.docx table), departure transfer -----------------
def doc_c():
    doc = docx.Document()
    doc.add_paragraph('ЗАЯВКА НА ТРАНСФЕР — ООО «Кавказ Тур»')
    rows = [
        ('Тип услуги', 'Трансфер'),
        ('Дата', '03.12.2026'),
        ('Время подачи', '4:30 PM'),
        ('Откуда', 'Отель Radisson Blu Iveria, Тбилиси'),
        ('Куда', 'Аэропорт Кутаиси (KUT)'),
        ('Рейс', 'W6 4470, вылет 21:15'),
        ('Кол-во пассажиров', '3 взрослых + 2 детей'),
        ('Транспорт', 'Минивэн'),
        ('Багаж', '7 чемоданов, 1 коляска'),
        ('Детские кресла', '2 (3 и 5 лет)'),
        ('Стоимость', '140 EUR'),
        ('Гость', 'Иванов Сергей'),
        ('Телефон', '+7 916 555 12 34'),
        ('Табличка', 'IVANOV'),
        ('Комментарий', 'Водитель должен говорить по-русски'),
    ]
    t = doc.add_table(rows=0, cols=2)
    for k, v in rows:
        c = t.add_row().cells
        c[0].text = k
        c[1].text = v
    doc.save(OUT + 'departure_form_ru.docx')

# ---- D: operator's Excel schedule, two groups, six rows -----------------------
def doc_d():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(['Date', 'Time', 'Service', 'From', 'To', 'Pax', 'Vehicle', 'Flight'])
    for r in [
        ('05.12.2026', '10:15', 'Arrival transfer', 'Tbilisi Airport', 'Hotel Biltmore', 2, 'Sedan', 'LH 2556'),
        ('06.12.2026', '09:30', 'Day tour', 'Hotel Biltmore', 'Kakheti (Sighnaghi, Tsinandali)', 2, 'Sedan', ''),
        ('07.12.2026', '05:00', 'Departure transfer', 'Hotel Biltmore', 'Tbilisi Airport', 2, 'Sedan', 'LH 2557 07:55'),
        ('20.12.2026', '14:20', 'Arrival transfer', 'Kutaisi Airport', 'Batumi, Hotel Sheraton', 9, 'Minibus', 'W6 2357'),
        ('22.12.2026', '08:00', 'Day tour', 'Batumi', 'Gonio – Makhuntseti – Mirveti', 9, 'Minibus', ''),
        ('24.12.2026', '11:00', 'Departure transfer', 'Batumi Sheraton', 'Batumi Airport', 9, 'Minibus', 'TK 381 13:45'),
    ]:
        ws.append(list(r))
    wb.save(OUT + 'schedule_two_groups.xlsx')

# ---- E: long WhatsApp export (iPhone .zip), details early, request at the end
def doc_e():
    random.seed(7)
    lines = []
    lines.append('[02/08/2026, 10:01:12] Levan (Tbilisi Tours): Hi! Group Kim from Seoul, 8 persons, lead guest Kim Min-jun +82 10 5555 0101, they always stay at Sheraton Grand Tbilisi Metechi Palace')
    lines.append('[02/08/2026, 10:02:40] Levan (Tbilisi Tours): they need a Korean-speaking guide but the driver can speak English')
    filler = ['ok', 'thanks', 'will check', 'the guests loved yesterday', 'payment sent', 'can you send the invoice?',
              'driver was great', 'please confirm tomorrow', 'ხვალ დაგირეკავთ', 'სუპერ, მადლობა', 'хорошо, спасибо']
    day, month = 3, 8
    for i in range(520):
        day += 1 if i % 6 == 0 else 0
        if day > 28: day, month = 1, month + 1
        who = 'Levan (Tbilisi Tours)' if i % 2 == 0 else 'KEKE Transport'
        lines.append(f'[{day:02d}/{month:02d}/2026, {9 + i % 9:02d}:{i % 60:02d}:11] {who}: {random.choice(filler)} — msg {i}')
    lines.append('[30/10/2026, 18:40:02] Levan (Tbilisi Tours): New request for the same Kim group as in August, same hotel and same guest contact')
    lines.append('[30/10/2026, 18:41:15] Levan (Tbilisi Tours): arrival 14/11 at 07:05, flight KE 9201, then 15/11 Kazbegi day trip, 16/11 departure flight 23:50')
    lines.append('[30/10/2026, 18:41:40] Levan (Tbilisi Tours): minivan is fine, they travel light')
    text = '\n'.join(lines) + '\n'
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('_chat.txt', text)
    open(OUT + 'whatsapp_export_long.zip', 'wb').write(buf.getvalue())
    print('E chat chars', len(text))

# ---- F: long brochure docx with the actual request on its last page ----------
def doc_f():
    doc = docx.Document()
    para = ('Georgia is a country at the intersection of Europe and Asia, known for its wine, mountains and hospitality. '
            'Our company offers tours across Kakheti, Svaneti, Adjara and Samtskhe-Javakheti. ') * 6
    for i in range(110):
        doc.add_paragraph(f'Chapter {i + 1}. ' + para)
    doc.add_paragraph('TRANSPORT ORDER')
    t = doc.add_table(rows=0, cols=2)
    for k, v in [('Service', 'Transfer'), ('Date', '08.12.2026'), ('Pickup time', '06:00'),
                 ('From', 'Hotel Paragraph Shekvetili'), ('To', 'Kutaisi Airport'), ('Pax', '5'),
                 ('Vehicle', 'Minivan'), ('Flight', 'W6 4318'), ('Price', '280 GEL')]:
        c = t.add_row().cells
        c[0].text = k
        c[1].text = v
    doc.save(OUT + 'long_brochure_order_at_end.docx')

doc_a(); doc_h(); doc_c(); doc_d(); doc_e(); doc_f()
print('ok')
