export type Dict = Record<string, string>;
const en: Dict = {
  comments: 'Comments', sortNew: 'Newest', sortHot: 'Top', nickname: 'Nickname', email: 'Email (optional, never shown)',
  placeholder: 'Write a comment…', notify: 'Email me when someone replies', submit: 'Post', posting: 'Posting…',
  reply: 'Reply', cancel: 'Cancel', replyTo: 'Replying to', more: 'Load more', empty: 'No comments yet. Be the first!',
  loading: 'Loading comments…', image: 'Add image', removeImage: 'Remove image', like: 'Like', dislike: 'Dislike',
  errLoad: 'Failed to load comments.', errNick: 'Please enter a nickname.', errText: 'Please write something.',
  errGeneric: 'Something went wrong, please try again.', errRate: 'Too many requests, please slow down.',
  errCaptcha: 'Verification failed, please try again.', errImage: 'Could not process this image.', errBanned: 'You are not allowed to comment.',
  pending: 'Awaiting review', justNow: 'just now', retry: 'Retry', imgAlt: 'Image attached by',
};
const zh: Dict = {
  comments: '评论', sortNew: '最新', sortHot: '最热', nickname: '昵称', email: '邮箱（可选，不会公开）',
  placeholder: '写下你的评论…', notify: '有人回复时邮件通知我', submit: '发表', posting: '发表中…',
  reply: '回复', cancel: '取消', replyTo: '回复', more: '加载更多', empty: '还没有评论，来抢沙发吧！',
  loading: '评论加载中…', image: '添加图片', removeImage: '移除图片', like: '赞', dislike: '踩',
  errLoad: '评论加载失败。', errNick: '请填写昵称。', errText: '请输入评论内容。',
  errGeneric: '出错了，请稍后重试。', errRate: '操作太频繁，请稍后再试。',
  errCaptcha: '人机验证失败，请重试。', errImage: '图片处理失败。', errBanned: '你已被禁止发表评论。',
  pending: '审核中', justNow: '刚刚', retry: '重试', imgAlt: '图片，作者：',
};
const zhTW: Dict = {
  comments: '留言', sortNew: '最新', sortHot: '最熱', nickname: '暱稱', email: '電子郵件（選填，不會公開）',
  placeholder: '寫下你的留言…', notify: '有人回覆時以郵件通知我', submit: '發表', posting: '發表中…',
  reply: '回覆', cancel: '取消', replyTo: '回覆', more: '載入更多', empty: '還沒有留言，來搶頭香吧！',
  loading: '留言載入中…', image: '新增圖片', removeImage: '移除圖片', like: '讚', dislike: '踩',
  errLoad: '留言載入失敗。', errNick: '請填寫暱稱。', errText: '請輸入留言內容。',
  errGeneric: '發生錯誤，請稍後再試。', errRate: '操作太頻繁，請稍後再試。',
  errCaptcha: '驗證失敗，請重試。', errImage: '圖片處理失敗。', errBanned: '你已被禁止留言。',
  pending: '審核中', justNow: '剛剛', retry: '重試', imgAlt: '圖片，作者：',
};
const ja: Dict = {
  comments: 'コメント', sortNew: '新着順', sortHot: '人気順', nickname: 'ニックネーム', email: 'メールアドレス（任意・非公開）',
  placeholder: 'コメントを書く…', notify: '返信があったらメールで通知する', submit: '投稿', posting: '投稿中…',
  reply: '返信', cancel: 'キャンセル', replyTo: '返信先', more: 'もっと見る', empty: 'まだコメントはありません。最初のコメントを書きましょう！',
  loading: 'コメントを読み込み中…', image: '画像を追加', removeImage: '画像を削除', like: 'いいね', dislike: 'よくない',
  errLoad: 'コメントを読み込めませんでした。', errNick: 'ニックネームを入力してください。', errText: 'コメントを入力してください。',
  errGeneric: 'エラーが発生しました。しばらくしてからもう一度お試しください。', errRate: 'リクエストが多すぎます。少し待ってください。',
  errCaptcha: '認証に失敗しました。もう一度お試しください。', errImage: '画像を処理できませんでした。', errBanned: 'コメントすることはできません。',
  pending: '承認待ち', justNow: 'たった今', retry: '再試行', imgAlt: '添付画像：',
};
const ko: Dict = {
  comments: '댓글', sortNew: '최신순', sortHot: '인기순', nickname: '닉네임', email: '이메일 (선택, 공개되지 않음)',
  placeholder: '댓글을 입력하세요…', notify: '답글이 달리면 이메일로 알림', submit: '등록', posting: '등록 중…',
  reply: '답글', cancel: '취소', replyTo: '답글 대상', more: '더 보기', empty: '아직 댓글이 없습니다. 첫 댓글을 남겨 보세요!',
  loading: '댓글 불러오는 중…', image: '이미지 추가', removeImage: '이미지 삭제', like: '좋아요', dislike: '싫어요',
  errLoad: '댓글을 불러오지 못했습니다.', errNick: '닉네임을 입력해 주세요.', errText: '내용을 입력해 주세요.',
  errGeneric: '문제가 발생했습니다. 잠시 후 다시 시도해 주세요.', errRate: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  errCaptcha: '인증에 실패했습니다. 다시 시도해 주세요.', errImage: '이미지를 처리할 수 없습니다.', errBanned: '댓글을 작성할 수 없습니다.',
  pending: '검토 대기 중', justNow: '방금', retry: '다시 시도', imgAlt: '첨부 이미지: ',
};
const es: Dict = {
  comments: 'Comentarios', sortNew: 'Recientes', sortHot: 'Populares', nickname: 'Apodo', email: 'Correo (opcional, nunca se muestra)',
  placeholder: 'Escribe un comentario…', notify: 'Avisarme por correo si alguien responde', submit: 'Publicar', posting: 'Publicando…',
  reply: 'Responder', cancel: 'Cancelar', replyTo: 'Respondiendo a', more: 'Cargar más', empty: 'Aún no hay comentarios. ¡Sé el primero!',
  loading: 'Cargando comentarios…', image: 'Añadir imagen', removeImage: 'Quitar imagen', like: 'Me gusta', dislike: 'No me gusta',
  errLoad: 'No se pudieron cargar los comentarios.', errNick: 'Introduce un apodo.', errText: 'Escribe algo.',
  errGeneric: 'Algo salió mal, inténtalo de nuevo.', errRate: 'Demasiadas solicitudes, espera un momento.',
  errCaptcha: 'Falló la verificación, inténtalo de nuevo.', errImage: 'No se pudo procesar la imagen.', errBanned: 'No tienes permiso para comentar.',
  pending: 'Pendiente de revisión', justNow: 'ahora mismo', retry: 'Reintentar', imgAlt: 'Imagen adjuntada por',
};
const fr: Dict = {
  comments: 'Commentaires', sortNew: 'Récents', sortHot: 'Populaires', nickname: 'Pseudo', email: 'E-mail (facultatif, jamais affiché)',
  placeholder: 'Écrire un commentaire…', notify: 'Me prévenir par e-mail en cas de réponse', submit: 'Publier', posting: 'Publication…',
  reply: 'Répondre', cancel: 'Annuler', replyTo: 'En réponse à', more: 'Voir plus', empty: 'Aucun commentaire pour le moment. Soyez le premier !',
  loading: 'Chargement des commentaires…', image: 'Ajouter une image', removeImage: 'Retirer l’image', like: 'J’aime', dislike: 'Je n’aime pas',
  errLoad: 'Impossible de charger les commentaires.', errNick: 'Veuillez saisir un pseudo.', errText: 'Veuillez écrire quelque chose.',
  errGeneric: 'Une erreur est survenue, veuillez réessayer.', errRate: 'Trop de requêtes, veuillez patienter.',
  errCaptcha: 'Échec de la vérification, veuillez réessayer.', errImage: 'Impossible de traiter cette image.', errBanned: 'Vous ne pouvez pas commenter.',
  pending: 'En attente de modération', justNow: 'à l’instant', retry: 'Réessayer', imgAlt: 'Image jointe par',
};
const de: Dict = {
  comments: 'Kommentare', sortNew: 'Neueste', sortHot: 'Beliebt', nickname: 'Name', email: 'E-Mail (optional, wird nie angezeigt)',
  placeholder: 'Kommentar schreiben…', notify: 'Per E-Mail benachrichtigen, wenn jemand antwortet', submit: 'Senden', posting: 'Wird gesendet…',
  reply: 'Antworten', cancel: 'Abbrechen', replyTo: 'Antwort an', more: 'Mehr laden', empty: 'Noch keine Kommentare. Schreib den ersten!',
  loading: 'Kommentare werden geladen…', image: 'Bild hinzufügen', removeImage: 'Bild entfernen', like: 'Gefällt mir', dislike: 'Gefällt mir nicht',
  errLoad: 'Kommentare konnten nicht geladen werden.', errNick: 'Bitte einen Namen eingeben.', errText: 'Bitte etwas schreiben.',
  errGeneric: 'Etwas ist schiefgelaufen, bitte erneut versuchen.', errRate: 'Zu viele Anfragen, bitte kurz warten.',
  errCaptcha: 'Überprüfung fehlgeschlagen, bitte erneut versuchen.', errImage: 'Das Bild konnte nicht verarbeitet werden.', errBanned: 'Du darfst nicht kommentieren.',
  pending: 'Wartet auf Freigabe', justNow: 'gerade eben', retry: 'Erneut versuchen', imgAlt: 'Bild von',
};
const pt: Dict = {
  comments: 'Comentários', sortNew: 'Recentes', sortHot: 'Populares', nickname: 'Apelido', email: 'E-mail (opcional, nunca exibido)',
  placeholder: 'Escreva um comentário…', notify: 'Avisar por e-mail quando alguém responder', submit: 'Publicar', posting: 'Publicando…',
  reply: 'Responder', cancel: 'Cancelar', replyTo: 'Respondendo a', more: 'Carregar mais', empty: 'Ainda não há comentários. Seja o primeiro!',
  loading: 'Carregando comentários…', image: 'Adicionar imagem', removeImage: 'Remover imagem', like: 'Curtir', dislike: 'Não curtir',
  errLoad: 'Falha ao carregar os comentários.', errNick: 'Informe um apelido.', errText: 'Escreva alguma coisa.',
  errGeneric: 'Algo deu errado, tente novamente.', errRate: 'Muitas solicitações, aguarde um pouco.',
  errCaptcha: 'Falha na verificação, tente novamente.', errImage: 'Não foi possível processar a imagem.', errBanned: 'Você não pode comentar.',
  pending: 'Aguardando revisão', justNow: 'agora mesmo', retry: 'Tentar novamente', imgAlt: 'Imagem enviada por',
};
const ru: Dict = {
  comments: 'Комментарии', sortNew: 'Новые', sortHot: 'Популярные', nickname: 'Имя', email: 'Email (необязательно, не показывается)',
  placeholder: 'Напишите комментарий…', notify: 'Уведомлять по email об ответах', submit: 'Отправить', posting: 'Отправка…',
  reply: 'Ответить', cancel: 'Отмена', replyTo: 'В ответ', more: 'Показать ещё', empty: 'Комментариев пока нет. Будьте первым!',
  loading: 'Загрузка комментариев…', image: 'Добавить изображение', removeImage: 'Удалить изображение', like: 'Нравится', dislike: 'Не нравится',
  errLoad: 'Не удалось загрузить комментарии.', errNick: 'Введите имя.', errText: 'Напишите что-нибудь.',
  errGeneric: 'Что-то пошло не так, попробуйте ещё раз.', errRate: 'Слишком много запросов, подождите.',
  errCaptcha: 'Проверка не пройдена, попробуйте ещё раз.', errImage: 'Не удалось обработать изображение.', errBanned: 'Вам запрещено комментировать.',
  pending: 'Ожидает проверки', justNow: 'только что', retry: 'Повторить', imgAlt: 'Изображение от',
};
const it: Dict = {
  comments: 'Commenti', sortNew: 'Recenti', sortHot: 'Popolari', nickname: 'Nome', email: 'Email (facoltativa, mai mostrata)',
  placeholder: 'Scrivi un commento…', notify: 'Avvisami via email se qualcuno risponde', submit: 'Pubblica', posting: 'Pubblicazione…',
  reply: 'Rispondi', cancel: 'Annulla', replyTo: 'In risposta a', more: 'Carica altri', empty: 'Ancora nessun commento. Sii il primo!',
  loading: 'Caricamento commenti…', image: 'Aggiungi immagine', removeImage: 'Rimuovi immagine', like: 'Mi piace', dislike: 'Non mi piace',
  errLoad: 'Impossibile caricare i commenti.', errNick: 'Inserisci un nome.', errText: 'Scrivi qualcosa.',
  errGeneric: 'Qualcosa è andato storto, riprova.', errRate: 'Troppe richieste, rallenta.',
  errCaptcha: 'Verifica fallita, riprova.', errImage: 'Impossibile elaborare l’immagine.', errBanned: 'Non puoi commentare.',
  pending: 'In attesa di revisione', justNow: 'adesso', retry: 'Riprova', imgAlt: 'Immagine allegata da',
};
const vi: Dict = {
  comments: 'Bình luận', sortNew: 'Mới nhất', sortHot: 'Nổi bật', nickname: 'Biệt danh', email: 'Email (tùy chọn, không hiển thị)',
  placeholder: 'Viết bình luận…', notify: 'Gửi email khi có người trả lời', submit: 'Đăng', posting: 'Đang đăng…',
  reply: 'Trả lời', cancel: 'Hủy', replyTo: 'Đang trả lời', more: 'Tải thêm', empty: 'Chưa có bình luận nào. Hãy là người đầu tiên!',
  loading: 'Đang tải bình luận…', image: 'Thêm ảnh', removeImage: 'Xóa ảnh', like: 'Thích', dislike: 'Không thích',
  errLoad: 'Không thể tải bình luận.', errNick: 'Vui lòng nhập biệt danh.', errText: 'Vui lòng nhập nội dung.',
  errGeneric: 'Đã xảy ra lỗi, vui lòng thử lại.', errRate: 'Quá nhiều yêu cầu, vui lòng chậm lại.',
  errCaptcha: 'Xác minh thất bại, vui lòng thử lại.', errImage: 'Không thể xử lý ảnh này.', errBanned: 'Bạn không được phép bình luận.',
  pending: 'Đang chờ duyệt', justNow: 'vừa xong', retry: 'Thử lại', imgAlt: 'Ảnh đính kèm bởi',
};
const id: Dict = {
  comments: 'Komentar', sortNew: 'Terbaru', sortHot: 'Terpopuler', nickname: 'Nama panggilan', email: 'Email (opsional, tidak ditampilkan)',
  placeholder: 'Tulis komentar…', notify: 'Beri tahu lewat email jika ada yang membalas', submit: 'Kirim', posting: 'Mengirim…',
  reply: 'Balas', cancel: 'Batal', replyTo: 'Membalas', more: 'Muat lebih banyak', empty: 'Belum ada komentar. Jadilah yang pertama!',
  loading: 'Memuat komentar…', image: 'Tambah gambar', removeImage: 'Hapus gambar', like: 'Suka', dislike: 'Tidak suka',
  errLoad: 'Gagal memuat komentar.', errNick: 'Masukkan nama panggilan.', errText: 'Tulis sesuatu.',
  errGeneric: 'Terjadi kesalahan, silakan coba lagi.', errRate: 'Terlalu banyak permintaan, harap pelan-pelan.',
  errCaptcha: 'Verifikasi gagal, silakan coba lagi.', errImage: 'Gambar tidak dapat diproses.', errBanned: 'Anda tidak diizinkan berkomentar.',
  pending: 'Menunggu peninjauan', justNow: 'baru saja', retry: 'Coba lagi', imgAlt: 'Gambar dilampirkan oleh',
};
const tr: Dict = {
  comments: 'Yorumlar', sortNew: 'En yeni', sortHot: 'En popüler', nickname: 'Takma ad', email: 'E-posta (isteğe bağlı, gösterilmez)',
  placeholder: 'Bir yorum yazın…', notify: 'Biri yanıtlarsa e-posta ile bildir', submit: 'Gönder', posting: 'Gönderiliyor…',
  reply: 'Yanıtla', cancel: 'İptal', replyTo: 'Yanıtlanan', more: 'Daha fazla', empty: 'Henüz yorum yok. İlk yorumu siz yazın!',
  loading: 'Yorumlar yükleniyor…', image: 'Görsel ekle', removeImage: 'Görseli kaldır', like: 'Beğen', dislike: 'Beğenme',
  errLoad: 'Yorumlar yüklenemedi.', errNick: 'Lütfen bir takma ad girin.', errText: 'Lütfen bir şey yazın.',
  errGeneric: 'Bir sorun oluştu, lütfen tekrar deneyin.', errRate: 'Çok fazla istek, lütfen yavaşlayın.',
  errCaptcha: 'Doğrulama başarısız, lütfen tekrar deneyin.', errImage: 'Görsel işlenemedi.', errBanned: 'Yorum yapmanıza izin verilmiyor.',
  pending: 'İnceleme bekliyor', justNow: 'az önce', retry: 'Yeniden dene', imgAlt: 'Görseli ekleyen:',
};

const pl: Dict = {
  comments: 'Komentarze', sortNew: 'Najnowsze', sortHot: 'Popularne', nickname: 'Pseudonim', email: 'E-mail (opcjonalnie, nigdy nie wyświetlany)',
  placeholder: 'Napisz komentarz…', notify: 'Powiadom mnie e-mailem o odpowiedzi', submit: 'Opublikuj', posting: 'Publikowanie…',
  reply: 'Odpowiedz', cancel: 'Anuluj', replyTo: 'Odpowiedź do', more: 'Załaduj więcej', empty: 'Brak komentarzy. Bądź pierwszy!',
  loading: 'Ładowanie komentarzy…', image: 'Dodaj obraz', removeImage: 'Usuń obraz', like: 'Lubię', dislike: 'Nie lubię',
  errLoad: 'Nie udało się załadować komentarzy.', errNick: 'Podaj pseudonim.', errText: 'Napisz coś.',
  errGeneric: 'Coś poszło nie tak, spróbuj ponownie.', errRate: 'Zbyt wiele żądań, zwolnij.',
  errCaptcha: 'Weryfikacja nie powiodła się, spróbuj ponownie.', errImage: 'Nie można przetworzyć obrazu.', errBanned: 'Nie możesz komentować.',
  pending: 'Oczekuje na moderację', justNow: 'przed chwilą', retry: 'Ponów', imgAlt: 'Obraz dodany przez',
};
const nl: Dict = {
  comments: 'Reacties', sortNew: 'Nieuwste', sortHot: 'Populairste', nickname: 'Bijnaam', email: 'E-mail (optioneel, nooit getoond)',
  placeholder: 'Schrijf een reactie…', notify: 'Mail me als iemand reageert', submit: 'Plaatsen', posting: 'Bezig met plaatsen…',
  reply: 'Beantwoorden', cancel: 'Annuleren', replyTo: 'Reactie op', more: 'Meer laden', empty: 'Nog geen reacties. Wees de eerste!',
  loading: 'Reacties laden…', image: 'Afbeelding toevoegen', removeImage: 'Afbeelding verwijderen', like: 'Leuk', dislike: 'Niet leuk',
  errLoad: 'Reacties laden mislukt.', errNick: 'Vul een bijnaam in.', errText: 'Schrijf iets.',
  errGeneric: 'Er ging iets mis, probeer het opnieuw.', errRate: 'Te veel verzoeken, doe het rustiger aan.',
  errCaptcha: 'Verificatie mislukt, probeer het opnieuw.', errImage: 'Deze afbeelding kon niet worden verwerkt.', errBanned: 'Je mag niet reageren.',
  pending: 'Wacht op beoordeling', justNow: 'zojuist', retry: 'Opnieuw', imgAlt: 'Afbeelding van',
};
const th: Dict = {
  comments: 'ความคิดเห็น', sortNew: 'ล่าสุด', sortHot: 'ยอดนิยม', nickname: 'ชื่อเล่น', email: 'อีเมล (ไม่บังคับ ไม่แสดงต่อสาธารณะ)',
  placeholder: 'เขียนความคิดเห็น…', notify: 'แจ้งทางอีเมลเมื่อมีผู้ตอบกลับ', submit: 'โพสต์', posting: 'กำลังโพสต์…',
  reply: 'ตอบกลับ', cancel: 'ยกเลิก', replyTo: 'ตอบกลับถึง', more: 'โหลดเพิ่มเติม', empty: 'ยังไม่มีความคิดเห็น มาเป็นคนแรกกัน!',
  loading: 'กำลังโหลดความคิดเห็น…', image: 'เพิ่มรูปภาพ', removeImage: 'ลบรูปภาพ', like: 'ถูกใจ', dislike: 'ไม่ถูกใจ',
  errLoad: 'โหลดความคิดเห็นไม่สำเร็จ', errNick: 'กรุณากรอกชื่อเล่น', errText: 'กรุณาเขียนข้อความ',
  errGeneric: 'เกิดข้อผิดพลาด โปรดลองอีกครั้ง', errRate: 'คำขอมากเกินไป โปรดรอสักครู่',
  errCaptcha: 'การยืนยันล้มเหลว โปรดลองอีกครั้ง', errImage: 'ไม่สามารถประมวลผลรูปภาพนี้ได้', errBanned: 'คุณไม่ได้รับอนุญาตให้แสดงความคิดเห็น',
  pending: 'รอการตรวจสอบ', justNow: 'เมื่อสักครู่', retry: 'ลองใหม่', imgAlt: 'รูปภาพโดย',
};
const uk: Dict = {
  comments: 'Коментарі', sortNew: 'Нові', sortHot: 'Популярні', nickname: 'Ім’я', email: 'Email (необов’язково, не показується)',
  placeholder: 'Напишіть коментар…', notify: 'Сповіщати email про відповіді', submit: 'Надіслати', posting: 'Надсилання…',
  reply: 'Відповісти', cancel: 'Скасувати', replyTo: 'У відповідь', more: 'Показати ще', empty: 'Коментарів ще немає. Будьте першим!',
  loading: 'Завантаження коментарів…', image: 'Додати зображення', removeImage: 'Видалити зображення', like: 'Подобається', dislike: 'Не подобається',
  errLoad: 'Не вдалося завантажити коментарі.', errNick: 'Введіть ім’я.', errText: 'Напишіть щось.',
  errGeneric: 'Щось пішло не так, спробуйте ще раз.', errRate: 'Забагато запитів, зачекайте.',
  errCaptcha: 'Перевірку не пройдено, спробуйте ще раз.', errImage: 'Не вдалося обробити зображення.', errBanned: 'Вам заборонено коментувати.',
  pending: 'Очікує перевірки', justNow: 'щойно', retry: 'Повторити', imgAlt: 'Зображення від',
};
const hi: Dict = {
  comments: 'टिप्पणियाँ', sortNew: 'नवीनतम', sortHot: 'लोकप्रिय', nickname: 'उपनाम', email: 'ईमेल (वैकल्पिक, कभी दिखाया नहीं जाएगा)',
  placeholder: 'टिप्पणी लिखें…', notify: 'कोई जवाब दे तो ईमेल से सूचित करें', submit: 'पोस्ट करें', posting: 'पोस्ट हो रहा है…',
  reply: 'जवाब दें', cancel: 'रद्द करें', replyTo: 'इसके जवाब में', more: 'और लोड करें', empty: 'अभी कोई टिप्पणी नहीं। पहले आप लिखें!',
  loading: 'टिप्पणियाँ लोड हो रही हैं…', image: 'चित्र जोड़ें', removeImage: 'चित्र हटाएँ', like: 'पसंद', dislike: 'नापसंद',
  errLoad: 'टिप्पणियाँ लोड नहीं हो सकीं।', errNick: 'कृपया उपनाम दर्ज करें।', errText: 'कृपया कुछ लिखें।',
  errGeneric: 'कुछ गड़बड़ हुई, कृपया पुनः प्रयास करें।', errRate: 'बहुत अधिक अनुरोध, कृपया धीमे चलें।',
  errCaptcha: 'सत्यापन विफल रहा, कृपया पुनः प्रयास करें।', errImage: 'इस चित्र को संसाधित नहीं किया जा सका।', errBanned: 'आपको टिप्पणी करने की अनुमति नहीं है।',
  pending: 'समीक्षा की प्रतीक्षा में', justNow: 'अभी', retry: 'पुनः प्रयास', imgAlt: 'चित्र भेजने वाला:',
};
const ar: Dict = {
  comments: 'التعليقات', sortNew: 'الأحدث', sortHot: 'الأكثر تفاعلاً', nickname: 'الاسم المستعار', email: 'البريد الإلكتروني (اختياري، لن يُعرض)',
  placeholder: 'اكتب تعليقاً…', notify: 'أبلغني بالبريد عند الرد', submit: 'نشر', posting: 'جارٍ النشر…',
  reply: 'رد', cancel: 'إلغاء', replyTo: 'رداً على', more: 'تحميل المزيد', empty: 'لا توجد تعليقات بعد. كن أول من يعلّق!',
  loading: 'جارٍ تحميل التعليقات…', image: 'إضافة صورة', removeImage: 'إزالة الصورة', like: 'إعجاب', dislike: 'عدم إعجاب',
  errLoad: 'تعذّر تحميل التعليقات.', errNick: 'يرجى إدخال اسم مستعار.', errText: 'يرجى كتابة شيء.',
  errGeneric: 'حدث خطأ، يرجى المحاولة مرة أخرى.', errRate: 'طلبات كثيرة جداً، يرجى التمهّل.',
  errCaptcha: 'فشل التحقق، يرجى المحاولة مرة أخرى.', errImage: 'تعذّرت معالجة هذه الصورة.', errBanned: 'غير مسموح لك بالتعليق.',
  pending: 'بانتظار المراجعة', justNow: 'الآن', retry: 'إعادة المحاولة', imgAlt: 'صورة مرفقة من',
};
const he: Dict = {
  comments: 'תגובות', sortNew: 'החדשות ביותר', sortHot: 'הפופולריות ביותר', nickname: 'כינוי', email: 'אימייל (אופציונלי, לא יוצג)',
  placeholder: 'כתבו תגובה…', notify: 'שלחו לי אימייל כשמישהו מגיב', submit: 'פרסום', posting: 'מפרסם…',
  reply: 'השב', cancel: 'ביטול', replyTo: 'בתגובה ל', more: 'טען עוד', empty: 'אין תגובות עדיין. היו הראשונים!',
  loading: 'טוען תגובות…', image: 'הוספת תמונה', removeImage: 'הסרת תמונה', like: 'אהבתי', dislike: 'לא אהבתי',
  errLoad: 'טעינת התגובות נכשלה.', errNick: 'נא להזין כינוי.', errText: 'נא לכתוב משהו.',
  errGeneric: 'משהו השתבש, נסו שוב.', errRate: 'יותר מדי בקשות, האטו קצת.',
  errCaptcha: 'האימות נכשל, נסו שוב.', errImage: 'לא ניתן לעבד את התמונה.', errBanned: 'אינך רשאי להגיב.',
  pending: 'ממתין לאישור', justNow: 'הרגע', retry: 'נסה שוב', imgAlt: 'תמונה מאת',
};

// 以语言主标签（或完整标签）为键；缺失的键回退到英文
const dicts: Record<string, { d: Dict; locale: string }> = {
  en: { d: en, locale: 'en' }, zh: { d: zh, locale: 'zh-CN' }, 'zh-tw': { d: zhTW, locale: 'zh-TW' },
  ja: { d: ja, locale: 'ja' }, ko: { d: ko, locale: 'ko' }, es: { d: es, locale: 'es' }, fr: { d: fr, locale: 'fr' },
  de: { d: de, locale: 'de' }, pt: { d: pt, locale: 'pt' }, ru: { d: ru, locale: 'ru' }, it: { d: it, locale: 'it' },
  vi: { d: vi, locale: 'vi' }, id: { d: id, locale: 'id' }, tr: { d: tr, locale: 'tr' },
  pl: { d: pl, locale: 'pl' }, nl: { d: nl, locale: 'nl' }, th: { d: th, locale: 'th' }, uk: { d: uk, locale: 'uk' },
  hi: { d: hi, locale: 'hi' }, ar: { d: ar, locale: 'ar' }, he: { d: he, locale: 'he' },
};
export const supportedLangs = Object.keys(dicts);

const RTL = new Set(['ar', 'he']);

export function dictFor(lang: string): { dict: Dict; locale: string; dir: 'ltr' | 'rtl' } {
  const l = (lang === 'auto' || !lang ? navigator.language : lang).toLowerCase().replace('_', '-');
  let key = l;
  if (/^zh-(tw|hk|mo|hant)/.test(l)) key = 'zh-tw';
  else if (!dicts[key]) key = l.split('-')[0];
  const hit = dicts[key] ?? dicts.en;
  return { dict: { ...en, ...hit.d }, locale: hit.locale, dir: RTL.has(key) ? 'rtl' : 'ltr' };
}
