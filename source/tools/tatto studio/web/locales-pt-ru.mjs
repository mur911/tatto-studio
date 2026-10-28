// Stable source keys: adding or reordering base phrases cannot shift translations.
const rows=`
语言|Idioma|Язык
纹身工作台 · 纹身库|tatto studio · Biblioteca|tatto studio · Библиотека
纹身工作台 · tatto studio|tatto studio|tatto studio
纹身工作台 · TATTOO STUDIO|TATTOO STUDIO|TATTOO STUDIO
未选择纹身|Nenhuma tatuagem selecionada|Татуировка не выбрана
撤销 ↶|Desfazer ↶|Отменить ↶
重做 ↷|Refazer ↷|Повторить ↷
导入设计文件|Importar design|Импорт дизайна
导出设计文件|Exportar design|Экспорт дизайна
保存设计|Salvar design|Сохранить дизайн
更新游戏纹身库 ↗|Atualizar biblioteca do jogo ↗|Обновить библиотеку игры ↗
01 / 纹身库|01 / Biblioteca de tatuagens|01 / Библиотека татуировок
打开目录|Abrir pasta|Открыть папку
输入分组名称|Digite o nome do grupo|Введите название группы
新分组名称|Nome do novo grupo|Название новой группы
新建分组|Novo grupo|Создать группу
纹身库中的分组和设计|Grupos e designs da biblioteca|Группы и дизайны библиотеки
当前分组|Grupo atual|Текущая группа
在当前分组新建纹身|Nova tatuagem neste grupo|Создать татуировку в группе
新建纹身|Nova tatuagem|Создать татуировку
保存位置|Local de salvamento|Папка сохранения
当前分组名称|Nome do grupo atual|Название текущей группы
重命名|Renomear|Переименовать
打开当前设计文件夹|Abrir pasta do design|Открыть папку дизайна
当前设计图层|Camadas do design atual|Слои текущего дизайна
02 / 当前设计图层|02 / Camadas do design|02 / Слои дизайна
＋ 带入图片|＋ Importar imagens|＋ Добавить изображения
带入图片|Importar imagens|Добавить изображения
用示例图案试操作|Testar imagem de exemplo|Попробовать образец
纹身图层|Camadas de tatuagem|Слои татуировки
还没有图层。带入图片后，从列表拖到模型上放置。|Sem camadas. Importe uma imagem e arraste sua camada para o modelo.|Слоёв пока нет. Добавьте изображение и перетащите его слой на модель.
角色模型与来源|Modelo e origem do personagem|Модель персонажа и источник
预览模型|Modelo de prévia|Модель для просмотра
已验证的 RB 女 V|V feminina RB verificada|Проверенная женская Ви RB
读取游戏角色快照|Capturar personagem do jogo|Считать персонажа из игры
显示真实皮肤参考|Mostrar pele capturada|Показать считанную кожу
显示皮肤凹凸与毛孔|Mostrar relevo e poros da pele|Показать рельеф кожи и поры
重新读取皮肤|Recarregar pele|Считать кожу заново
皮肤来源与限制|Origens e limitações da pele|Источники кожи и ограничения
正在准备模型…|Preparando modelo…|Подготовка модели…
正面|Frente|Спереди
背面|Costas|Сзади
左侧|Esquerda|Слева
右侧|Direita|Справа
全身|Enquadrar modelo|Модель целиком
变换工具|Ferramentas de transformação|Инструменты трансформации
移动|Mover|Перемещение
旋转|Girar|Поворот
缩放|Escalar|Масштаб
移动 W|Mover W|Перемещение W
旋转 E|Girar E|Поворот E
缩放 R|Escalar R|Масштаб R
预览光照|Iluminação de prévia|Освещение просмотра
水平角度|Azimute|Азимут
仰角|Elevação|Высота
光照水平角度|Azimute da luz|Азимут освещения
光照仰角|Elevação da luz|Угол высоты освещения
重置|Redefinir|Сбросить
重置预览光照；不影响纹身输出|Redefinir iluminação; não altera a tatuagem exportada|Сбросить освещение просмотра; на экспорт татуировки не влияет
可旋转的角色三维预览|Prévia 3D interativa do personagem|Интерактивный 3D-просмотр персонажа
XYZ 变换手柄|Controles de transformação XYZ|Манипуляторы трансформации XYZ
W 移动 · E 旋转 · R 缩放|W Mover · E Girar · R Escalar|W Перемещение · E Поворот · R Масштаб
带入图片开始|Importe uma imagem para começar|Добавьте изображение для начала
拖入图层放置 · 点击纹身编辑 · 空白拖动旋转|Arraste uma camada para posicionar · Clique na tatuagem para editar · Arraste o fundo para orbitar|Перетащите слой на модель · Нажмите на татуировку для правки · Тяните фон для вращения вида
UV 工作窗|Área UV|Окно UV
UV 贴图区域|Atlas UV|UV-атлас
放大或还原 UV 工作窗|Expandir ou restaurar área UV|Развернуть или восстановить окно UV
放大|Expandir|Развернуть
还原|Restaurar|Восстановить
折叠 UV|Recolher UV|Свернуть UV
可放置纹身的 UV 图|Mapa UV para posicionar tatuagens|UV-карта для размещения татуировок
UV 变换手柄|Controles de transformação UV|Манипуляторы трансформации UV
UV 变换工具|Ferramentas de transformação UV|Инструменты трансформации UV
简化线框|Malha simplificada|Упрощённый каркас
缩小 UV 视图|Diminuir zoom UV|Отдалить UV
放大 UV 视图|Aumentar zoom UV|Приблизить UV
UV 视图缩放百分比|Porcentagem de zoom UV|Масштаб UV в процентах
复位|Redefinir vista|Сбросить вид
W 移动 · E 旋转 · R 缩放 · 滚轮缩放 · 右键平移 · 右下角拖大窗口|W Mover · E Girar · R Escalar · Roda: zoom · Arraste com botão direito: mover vista · Redimensione pelo canto inferior direito|W Перемещение · E Поворот · R Масштаб · Колесо: приближение · Правая кнопка: сдвиг вида · Размер окна: правый нижний угол
03 / 当前纹身|03 / Tatuagem atual|03 / Текущая татуировка
设计名称|Nome do design|Название дизайна
游戏输出清晰度|Resolução da textura no jogo|Разрешение текстуры для игры
2K · 较省显存|2K · Menor uso de memória de vídeo|2K · Меньше видеопамяти
4K · 小字与细线更清晰|4K · Textos e linhas finas mais nítidos|4K · Чётче мелкий текст и тонкие линии
检查游戏输出清晰度|Conferir qualidade da textura do jogo|Проверить качество текстуры для игры
保存后会出现在左侧纹身库。|Designs salvos aparecem na biblioteca à esquerda.|Сохранённые дизайны появятся в библиотеке слева.
选择一个图层|Selecione uma camada|Выберите слой
删除图层|Excluir camada|Удалить слой
映射方式|Modo de projeção|Способ проекции
平面贴花 · 单面|Decalque plano · Uma face|Плоская декаль · Одна сторона
圆柱环绕|Projeção cilíndrica|Цилиндрическая проекция
球形投射|Projeção esférica|Сферическая проекция
三平面混合|Mesclagem triplanar|Трипланарное смешивание
UV 直接放置|Posicionamento UV direto|Размещение прямо на UV
投射部位|Região de destino|Область проекции
所有部位|Todas as regiões|Все области
坐标系|Sistema de coordenadas|Система координат
世界 XYZ|XYZ global|Мировые XYZ
投射器局部 XYZ|XYZ local do projetor|Локальные XYZ проектора
位置 · cm|Posição · cm|Положение · см
投射器旋转 · °|Rotação do projetor · °|Поворот проектора · °
竖直对齐投射器|Alinhar projetor na vertical|Выровнять проектор вертикально
将投射器贴合当前表面|Ajustar projetor à superfície|Прижать проектор к поверхности
UV 宽度 %|Largura UV %|Ширина UV %
UV 高度 %|Altura UV %|Высота UV %
UV 旋转 · °|Rotação UV · °|Поворот UV · °
UV 旋转角度|Ângulo de rotação UV|Угол поворота UV
投射宽度|Largura da projeção|Ширина проекции
投射高度|Altura da projeção|Высота проекции
按原图比例匹配平面宽高|Ajustar plano à proporção da imagem|Подогнать плоскость под пропорции изображения
投射深度／厚度|Profundidade / espessura|Глубина / толщина проекции
投射深度厘米（无上限）|Profundidade em cm (sem limite)|Глубина проекции в см (без ограничения)
半径 · cm|Raio · cm|Радиус · см
环绕角度 · °|Ângulo de cobertura · °|Угол охвата · °
垂直覆盖角度 · °|Cobertura vertical · °|Вертикальный угол охвата · °
按实际弧长旋转图案|Girar usando o comprimento real do arco|Вращать по фактической длине дуги
按图片比例匹配圆柱宽高|Ajustar cilindro à proporção da imagem|Подогнать цилиндр под пропорции изображения
将环绕轴心移入当前身体表面|Mover eixo para dentro da superfície|Переместить ось внутрь поверхности тела
三平面混合硬度|Nitidez da mesclagem triplanar|Резкость трипланарного смешивания
图案旋转归零|Redefinir rotação da imagem|Сбросить поворот рисунка
图案旋转|Rotação da imagem|Поворот рисунка
纹理边界|Borda da textura|Граница текстуры
不重复 · 外部透明|Sem repetição · Exterior transparente|Без повтора · Снаружи прозрачно
重复平铺|Repetir|Повторять
镜像平铺|Repetição espelhada|Зеркальный повтор
横向重复|Repetição horizontal|Повтор по горизонтали
纵向重复|Repetição vertical|Повтор по вертикали
透明度|Opacidade|Непрозрачность
图层模糊|Desfoque da camada|Размытие слоя
图层模糊半径|Raio de desfoque da camada|Радиус размытия слоя
图层混合模式|Modo de mesclagem da camada|Режим наложения слоя
正常|Normal|Обычный
正片叠底|Multiplicação|Умножение
变暗|Escurecer|Затемнение
滤色|Divisão|Экран
叠加|Sobrepor|Перекрытие
柔光|Luz suave|Мягкий свет
混合对象|Mesclar com|Смешивать с
当前皮肤与下方纹身|Pele atual e tatuagens abaixo|Текущая кожа и татуировки ниже
仅下方纹身（旧版行为）|Somente tatuagens abaixo (legado)|Только татуировки ниже (прежний режим)
去白底（墨水融合）|Remover fundo branco (mesclar tinta)|Удалить белый фон (смешивание чернил)
下移 ↓|Mover para baixo ↓|Ниже ↓
上移 ↑|Mover para cima ↑|Выше ↑
启用旧 RB 耻骨补片|Ativar correção púbica RB antiga|Включить прежнюю лобковую заплатку RB
旧式单套安装包|Pacote individual antigo|Прежний пакет одного дизайна
选快照，再更新游戏纹身库|Selecione uma captura e atualize a biblioteca do jogo|Выберите снимок и обновите библиотеку игры
模型适配范围|Compatibilidade de modelos|Совместимость моделей
正在加载纹身库…|Carregando biblioteca de tatuagens…|Загрузка библиотеки татуировок…
本机保存 · 自行部署|Salvo localmente · Implantação manual|Локальное сохранение · Ручное развёртывание
身体|Corpo|Тело
肩颈接缝|Junção ombros / pescoço|Шов плеч и шеи
左臂|Braço esquerdo|Левая рука
右臂|Braço direito|Правая рука
头部与颈部|Cabeça e pescoço|Голова и шея
颈部|Pescoço|Шея
生殖器|Genitais|Гениталии
✓ 已保存|✓ Salvo|✓ Сохранено
草稿已保存|Rascunho salvo|Черновик сохранён
● 有未保存修改|● Alterações não salvas|● Есть несохранённые изменения
编辑中 · 有未保存修改|Editando · Alterações não salvas|Редактирование · Изменения не сохранены
正在保存…|Salvando…|Сохранение…
保存成功！|Salvo com sucesso!|Успешно сохранено!
正在更新|Atualizando…|Обновление…
更新完成|Atualização concluída|Обновление завершено
更新失败|Falha na atualização|Ошибка обновления
正在导出模组|Exportando mod…|Экспорт мода…
模组导出完成|Mod exportado|Экспорт мода завершён
选择导出格式|Escolher formato de exportação|Выберите формат экспорта
导出当前设计|Exportar design atual|Экспорт текущего дизайна
可编辑设计文件 (.tattoo.json)|Design editável (.tattoo.json)|Редактируемый дизайн (.tattoo.json)
独立游戏模组 (.zip)|Mod independente (.zip)|Самостоятельный игровой мод (.zip)
下载独立模组|Baixar mod independente|Скачать самостоятельный мод
可编辑设计|Design editável|Редактируемый дизайн
安装与适配说明|Instalação e compatibilidade|Установка и совместимость
文件夹顺序已保存|Ordem das pastas salva|Порядок папок сохранён
纹身顺序已保存|Ordem das tatuagens salva|Порядок татуировок сохранён
纹身库还没有分组。输入名称，点击「新建分组」。|A biblioteca não tem grupos. Digite um nome e clique em Novo grupo.|В библиотеке нет групп. Введите название и нажмите «Создать группу».
空分组 · 选中后点击「新建纹身」|Grupo vazio · Selecione e clique em Nova tatuagem|Пустая группа · Выберите её и нажмите «Создать татуировку»
已保存草稿 · 暂不加入游戏|Rascunho salvo · Fora do jogo|Черновик сохранён · Не включён в игру
加入游戏|Incluído no jogo|Включено в игру
未加入游戏|Fora do jogo|Не включено в игру
加入游戏纹身库|Incluir na biblioteca do jogo|Включить в библиотеку игры
草稿无可用贴图，放置后保存即可发布|Rascunho sem textura. Posicione a imagem e salve antes de publicar.|В черновике нет текстуры. Разместите изображение и сохраните перед публикацией.
撤回删除|Desfazer exclusão|Отменить удаление
按住直接拖动排序|Arraste para reordenar|Перетащите для изменения порядка
双击改名，点击空白完成|Clique duas vezes para renomear; clique fora para concluir|Двойной щелчок: переименовать; щелчок снаружи: завершить
长按后上下拖动排序|Segure ou arraste na vertical para reordenar|Удерживайте или тяните вверх и вниз для изменения порядка
上下拖动或拖动手柄排序；拖到模型表面放置|Arraste na vertical ou pela alça para reordenar; arraste ao modelo para posicionar|Тяните вертикально или за ручку для сортировки; на модель — для размещения
按住拖动，调整上下顺序|Arraste para mudar a ordem das camadas|Перетащите для изменения порядка слоёв
已放置 · 上下排序 / 拖到模型定位|Posicionada · Arraste na vertical para ordenar / ao modelo para mover|Размещено · Вертикально: порядок / На модель: перемещение
待放置 · 上下排序 / 拖到模型|Não posicionada · Arraste para ordenar / ao modelo para posicionar|Не размещено · Вертикально: порядок / На модель: размещение
点击纹身编辑 · 点击空白隐藏手柄|Clique na tatuagem para editar · Clique no fundo para ocultar controles|Нажмите на татуировку для правки · Нажмите на фон, чтобы скрыть манипуляторы
从左侧拖动图层到模型表面放置|Arraste uma camada da esquerda para o modelo|Перетащите слой слева на поверхность модели
先带入图片，再拖到模型|Importe uma imagem e arraste ao modelo|Добавьте изображение и перетащите на модель
松开以放置|Solte para posicionar|Отпустите для размещения
操作失败|Falha na operação|Ошибка операции
导出失败|Falha na exportação|Ошибка экспорта
请先输入新分组的名称|Digite primeiro o nome do novo grupo|Сначала введите название новой группы
正在读取皮肤参考…|Carregando referência de pele…|Загрузка образца кожи…
此参考模型尚未采集皮肤。|Este modelo ainda não tem pele capturada.|Для этой модели кожа ещё не считана.
正在烘焙并写入纹身库…|Gerando texturas e salvando na biblioteca…|Запекание и сохранение в библиотеку…
正在生成独立模组贴图…|Gerando texturas do mod independente…|Создание текстур самостоятельного мода…
请等待当前操作完成|Aguarde a operação atual terminar|Дождитесь завершения текущей операции
请先把图片放到模型上，再导出独立模组|Posicione uma imagem no modelo antes de exportar o mod|Разместите изображение на модели перед экспортом мода
游戏纹身库已更新|Biblioteca do jogo atualizada|Библиотека игры обновлена
首次安装包已生成|Primeiro pacote de instalação criado|Создан пакет для первой установки
生成失败：游戏文件未更新|Falha na geração: arquivos do jogo não atualizados|Сборка не удалась: файлы игры не обновлены
图片转换失败|Falha ao converter imagem|Не удалось преобразовать изображение
图片读取失败|Falha ao carregar imagem|Не удалось загрузить изображение
设计文件过大|Arquivo de design muito grande|Файл дизайна слишком большой
请选择图片文件|Selecione um arquivo de imagem|Выберите файл изображения
单张图片请控制在 24 MB 以内|Cada imagem deve ter menos de 24 MB|Каждое изображение должно быть меньше 24 МБ
图片尺寸过大，请缩小后再试|Dimensões muito grandes; reduza a imagem e tente novamente|Изображение слишком большое; уменьшите его и повторите
正在处理其他操作，请稍后带入图片|Outra operação em andamento; importe imagens depois|Выполняется другая операция; добавьте изображения позже
点击选择图片，或从文件管理器拖入；支持常见图片格式|Clique para escolher imagens ou arraste arquivos; formatos comuns aceitos|Выберите изображения или перетащите файлы; поддерживаются распространённые форматы
已撤销上一步 · Ctrl+Shift+Z 重做|Desfeito · Ctrl+Shift+Z para refazer|Отменено · Ctrl+Shift+Z для повтора
已重做 · Ctrl+Z 撤销|Refeito · Ctrl+Z para desfazer|Повторено · Ctrl+Z для отмены
变换已更新，保存设计后会保留。|Transformação atualizada. Salve o design para manter.|Трансформация обновлена. Сохраните дизайн, чтобы её оставить.
厚度|Espessura|Толщина
投射厚度（无上限）|Espessura de projeção (sem limite)|Толщина проекции (без ограничения)
W 移动 · 拖动箭头；中心圆在视平面移动|W Mover · Arraste setas; o centro move no plano da vista|W Перемещение · Тяните стрелки; центр перемещает в плоскости вида
E 旋转 · 拖动圆环；Shift 按15°吸附|E Girar · Arraste anéis; Shift ajusta em passos de 15°|E Поворот · Тяните кольца; Shift привязывает к шагу 15°
R 缩放 · 平面蓝轴调深度；环绕用金色厚度手柄；Alt 拖动调厚度|R Escalar · Eixo azul: profundidade; alça dourada: espessura; Alt-arrastar: espessura|R Масштаб · Синяя ось: глубина; золотая ручка: толщина; Alt-перетаскивание: толщина
单向平面贴花，适合文字和标志。W/E/R 调整整个投射器。|Decalque plano de uma face para textos e logotipos. W/E/R ajusta o projetor.|Односторонняя плоская декаль для текста и логотипов. W/E/R управляют проектором.
直接在原模型 UV 中放置；跨 UV 接缝需分别对齐。|Posicione nos UVs originais; alinhe as junções UV separadamente.|Размещайте прямо на исходных UV; участки по разные стороны UV-швов выравниваются отдельно.
绕局部 Y 轴环绕，适合手臂、小腿。调半径和轴心；接缝在背向投射器的一侧。|Envolve o eixo Y local, ideal para braços e panturrilhas. Ajuste raio e eixo; a junção fica oposta ao projetor.|Обёртка вокруг локальной оси Y для рук и икр. Настройте радиус и ось; шов расположен с противоположной стороны от проектора.
围绕中心球形包裹，适合肩、膝等弯曲区域；两极会有拉伸。|Projeção esférica para ombros e joelhos; pode esticar nos polos.|Сферическая обёртка для плеч, коленей и других изгибов; на полюсах возможно растяжение.
沿三个方向混合，适合连续花纹；文字可能重复或混合。|Mescla três direções para padrões contínuos; textos podem repetir ou se sobrepor.|Смешивание трёх направлений для непрерывных узоров; текст может повторяться или накладываться.
分组是义体医生的选项栏；组内设计是可切换的纹身。上下拖动列表或手柄排序。|Grupos viram categorias no medicânico; designs são tatuagens selecionáveis. Arraste linhas ou alças para reordenar.|Группы становятся категориями у рипера, а дизайны — выбираемыми татуировками. Тяните строки или ручки для сортировки.
支持常见图片格式，可从文件管理器拖入；动图取首帧。上下拖动图层或手柄排序，上层覆盖下层。|Formatos comuns aceitos; arraste arquivos para importar. Animações usam o primeiro quadro. Camadas superiores cobrem as inferiores; arraste para ordenar.|Поддерживаются распространённые форматы и перетаскивание файлов. Для анимации берётся первый кадр. Верхние слои закрывают нижние; порядок меняется перетаскиванием.
选择快照只切换预览，不保存或标记修改。「更新游戏纹身库」会将全部已勾选纹身匹配到当前快照，自动保存并生成游戏包；原图和摆放参数保留。|Selecionar uma captura só altera a prévia. Atualizar biblioteca do jogo adapta todas as tatuagens marcadas, salva e gera o mod. Imagens originais e posições são mantidas.|Выбор снимка меняет только просмотр. Обновление библиотеки игры адаптирует отмеченные татуировки, сохраняет их и собирает мод. Исходные изображения и параметры размещения сохраняются.
读取本机已部署的材质、肤色与贴图。普通图层不使用皮肤颜色；选择与皮肤混合时，颜色效果会进入图案覆盖处，图案之外仍透明。游戏灯光、动态材质与捏脸细节仍可能有差异。|Usa materiais e texturas instalados localmente. Camadas normais ignoram a cor da pele; a mesclagem com pele afeta apenas a área do desenho. Luzes, materiais dinâmicos e detalhes do rosto podem diferir.|Используются локально установленные материалы и текстуры кожи. Обычные слои не учитывают цвет кожи; смешивание с кожей действует только в пределах рисунка. Освещение, динамические материалы и черты лица в игре могут отличаться.
编辑时直接预览原图。输出为整片 UV 贴图，4K 增加细节，也更占显存；旧设计保留 2K。|A edição mostra a imagem original. A saída é uma textura UV completa; 4K traz mais detalhes e usa mais memória de vídeo. Designs antigos mantêm 2K.|При правке показывается исходное изображение. Вывод — текстура всего UV-атласа; 4K даёт больше деталей и требует больше видеопамяти. Старые дизайны сохраняют 2K.
保存时自动回到原图预览、释放检查缓冲；文件仍按上方所选分辨率输出。|Salvar restaura a prévia original e libera os buffers de inspeção. Os arquivos usam a resolução escolhida.|При сохранении возвращается просмотр оригинала и освобождаются буферы проверки. Файлы выводятся в выбранном разрешении.
滑条到 100 cm；数值与 R 厚度缩放可继续增大。蓝色虚线标出前后深度边界。|Controle até 100 cm. O campo numérico e R permitem valores maiores. Linhas azuis tracejadas marcam os limites de profundidade.|Ползунок до 100 см. Числовое поле и регулировка толщины R позволяют больше. Синие пунктирные линии отмечают границы глубины.
按原图像素计算；0 为关闭。随设计保存并用于游戏输出，原图保留。|Medido em pixels da imagem original; 0 desativa. Salvo no design e aplicado à saída do jogo; o original é preservado.|Измеряется в пикселях оригинала; 0 отключает размытие. Сохраняется с дизайном и применяется при выводе в игру; оригинал сохраняется.
选择「当前皮肤」后，单张图案也能混合；颜色效果会写入输出，仅限图案覆盖处。更换皮肤后需重新读取并保存。纯黑在正常、变暗、正片叠底下可能相同；灰色/彩色更易比较。|Mesclar com a pele funciona com uma única imagem e só afeta a área do desenho. Após trocar a pele, recarregue e salve. Preto puro pode parecer igual em Normal, Escurecer e Multiplicação; compare cinza ou cores.|Смешивание с текущей кожей работает и с одним изображением, только в пределах рисунка. После смены кожи считайте её заново и сохраните дизайн. Чистый чёрный может выглядеть одинаково в режимах «Обычный», «Затемнение» и «Умножение»; сравнивайте серые или цветные рисунки.
切换快照只改变预览。更新时会自动保存当前编辑，并将全部已勾选纹身匹配到当前快照，生成模组后由你在Vortex部署。|Trocar a captura só muda a prévia. Atualizar salva as edições, adapta tatuagens marcadas à captura atual e gera um mod para implantar no Vortex.|Смена снимка меняет только просмотр. При обновлении правки сохраняются, отмеченные татуировки адаптируются к текущему снимку и собирается мод для ручного развёртывания в Vortex.
实际网格输出为女V测试版。支持头颈和身体同组，首次请核对第一人称显示；预览是参考姿势、参考脸型。|Saída de malha experimental para V feminina. Cabeça, pescoço e corpo podem compartilhar grupo; confira a primeira pessoa. A prévia usa pose e rosto de referência.|Вывод реальной сетки — тестовая версия для женской Ви. Голова, шея и тело могут быть в одной группе; проверьте вид от первого лица. Просмотр использует эталонную позу и форму лица.
图片、位置、透明度、模糊、混合等全部参数；供其他工作台继续编辑。|Inclui imagens, posições, opacidade, desfoque e mesclagem para continuar editando em outro computador.|Содержит изображения, положение, непрозрачность, размытие и смешивание для дальнейшей правки на другом компьютере.
仅当前设计；按选中的身体快照构建，解压 archive 到游戏根目录或用 Vortex 安装。|Só o design atual, feito para a captura corporal selecionada. Extraia archive na raiz do jogo ou instale pelo Vortex.|Только текущий дизайн, собранный для выбранного снимка тела. Распакуйте archive в корень игры или установите через Vortex.
{0}组 · {1}个设计|{0} grupos · {1} designs|Групп: {0} · Дизайнов: {1}
{0}个图层 · {1}|{0} camadas · {1}|Слоёв: {0} · {1}
在「{0}」中新建纹身|Nova tatuagem em “{0}”|Создать татуировку в «{0}»
{0} 中的纹身|Tatuagens em {0}|Татуировки в {0}
已选择分组：{0}|Grupo selecionado: {0}|Выбрана группа: {0}
已从纹身库打开：{0}|Aberto da biblioteca: {0}|Открыто из библиотеки: {0}
已恢复最近的设计：{0}|Design recente restaurado: {0}|Восстановлен последний дизайн: {0}
未保存的修改 · {0}|Alterações não salvas · {0}|Несохранённые изменения · {0}
已保存于 {0}|Salvo em {0}|Сохранено в {0}
当前分组：{0}。新建纹身或直接带入图片后保存。|Grupo atual: {0}. Crie uma tatuagem ou importe imagens e salve.|Текущая группа: {0}. Создайте татуировку или добавьте изображения и сохраните.
新建一个分组，或直接带入图片并保存。|Crie um grupo ou importe imagens e salve.|Создайте группу или добавьте изображения и сохраните.
收起分组 {0}|Recolher grupo {0}|Свернуть группу {0}
展开分组 {0}|Expandir grupo {0}|Развернуть группу {0}
收起纹身列表|Recolher lista de tatuagens|Свернуть список татуировок
展开纹身列表|Expandir lista de tatuagens|Развернуть список татуировок
选择分组 {0}|Selecionar grupo {0}|Выбрать группу {0}
重命名分组 {0}|Renomear grupo {0}|Переименовать группу {0}
删除分组 {0}|Excluir grupo {0}|Удалить группу {0}
打开设计 {0}|Abrir design {0}|Открыть дизайн {0}
重命名纹身 {0}|Renomear tatuagem {0}|Переименовать татуировку {0}
删除纹身 {0}|Excluir tatuagem {0}|Удалить татуировку {0}
拖动排序分组 {0}|Reordenar grupo {0}|Изменить порядок группы {0}
拖动排序纹身 {0}|Reordenar tatuagem {0}|Изменить порядок татуировки {0}
拖动排序图层 {0}|Reordenar camada {0}|Изменить порядок слоя {0}
重命名图层 {0}|Renomear camada {0}|Переименовать слой {0}
删除图层 {0}|Excluir camada {0}|Удалить слой {0}
图层 {0}|Camada {0}|Слой {0}
发布 {0}|Publicar {0}|Опубликовать {0}
操作失败：{0}|Falha na operação: {0}|Ошибка операции: {0}
正在保存纹理 {0} / {1}…|Salvando texturas {0} / {1}…|Сохранение текстур {0} / {1}…
正在导出贴图 {0} / {1}…|Exportando texturas {0} / {1}…|Экспорт текстур {0} / {1}…
正在读取图片：{0}|Carregando imagem: {0}|Загрузка изображения: {0}
已带入 {0} 张图片；从图层列表拖到模型上放置。|{0} imagens importadas; arraste as camadas ao modelo para posicionar.|Добавлено изображений: {0}; перетащите слои на модель для размещения.
已读取皮肤：{0} / {1} 个部位。肤色、颜色贴图与细节为近似预览。|Pele carregada: {0} / {1} regiões. Tom, texturas e detalhes são aproximados.|Кожа считана: областей {0} / {1}. Цвет, текстуры и детали отображаются приблизительно.
已删除「{0}」。|“{0}” excluído.|«{0}» удалено.
纹身已改名：{0}|Tatuagem renomeada: {0}|Татуировка переименована: {0}
分组已改名：{0}；更新游戏纹身库后生效。|Grupo renomeado: {0}; atualize a biblioteca do jogo para aplicar.|Группа переименована: {0}; обновите библиотеку игры для применения.
已恢复：{0}|Restaurado: {0}|Восстановлено: {0}
已选中「{0}」；使用 W/E/R 调整，点击空白隐藏手柄。|“{0}” selecionado; ajuste com W/E/R, clique no fundo para ocultar controles.|Выбрано «{0}»; используйте W/E/R для настройки, нажмите на фон, чтобы скрыть манипуляторы.
已放置「{0}」。点击纹身选中；点击空白隐藏手柄。|“{0}” posicionado. Clique na tatuagem para selecionar; no fundo para ocultar controles.|«{0}» размещено. Нажмите на татуировку для выбора; на фон — чтобы скрыть манипуляторы.
位置 {0}|Posição {0}|Положение {0}
旋转 {0}|Rotação {0}|Поворот {0}
绕{0}旋转|Girar em torno de {0}|Поворот вокруг {0}
游戏角色资源 / {0}|Personagem do jogo / {0}|Персонаж из игры / {0}
{0} / 实际网格输出 · 待游戏测试|{0} / Malha capturada · Aguardando teste no jogo|{0} / Считанная сетка · Нужна проверка в игре
{0} / 仅参考预览|{0} / Só prévia de referência|{0} / Только справочный просмотр
{0} / 可发布|{0} / Pronto para publicar|{0} / Готово к публикации
实际网格纹身输出为测试版|Saída de tatuagem na malha capturada é experimental|Вывод татуировки на считанную сетку — тестовая функция
支持头颈与身体同组，首次请核对第一人称显示|Cabeça, pescoço e corpo no mesmo grupo; confira a primeira pessoa|Голова, шея и тело могут быть в одной группе; проверьте вид от первого лица
脸型预览仍为参考形状|A prévia do rosto usa uma forma de referência|Для просмотра лица используется эталонная форма
资源参考姿势，未还原实时骨骼与 Morph 变形|Pose de referência; esqueleto e deformações Morph em tempo real não reproduzidos|Эталонная поза; текущие деформации скелета и Morph не воспроизводятся
参考姿势，不含游戏灯光|Pose de referência, sem luzes do jogo|Эталонная поза, без игрового освещения
贴图来源：{0}|Origens das texturas: {0}|Источники текстур: {0}
已按游戏加载顺序解析 {0} 处重复资源|{0} recursos duplicados resolvidos pela ordem de carregamento do jogo|Дублирующихся ресурсов разрешено по порядку загрузки игры: {0}
优先使用：{0}|Preferido: {0}|Приоритет: {0}
皮肤参考未能读取：{0}|Não foi possível carregar a referência de pele: {0}|Не удалось считать образец кожи: {0}
可继续编辑纹身；重新读取皮肤不会修改设计。|Você pode continuar editando; recarregar a pele não altera o design.|Можно продолжать правку; повторное считывание кожи не изменяет дизайн.
皮肤参考已更新，设计未修改。|Referência de pele atualizada; design inalterado.|Образец кожи обновлён; дизайн не изменён.
皮肤未能读取，请查看角色模型区域的提示。|Pele não carregada; confira o painel do modelo do personagem.|Не удалось считать кожу; проверьте сообщение в разделе модели персонажа.
已切换预览快照，纹身库未修改。点击「更新游戏纹身库」后，全部已勾选纹身会匹配此模型。|Captura de prévia alterada; biblioteca inalterada. Atualize a biblioteca do jogo para adaptar as tatuagens marcadas.|Снимок для просмотра изменён; библиотека не менялась. Обновите библиотеку игры, чтобы адаптировать отмеченные татуировки.
新快照已用于预览，纹身库未修改。点击「更新游戏纹身库」后，全部已勾选纹身会匹配此模型。|Nova captura carregada para prévia; biblioteca inalterada. Atualize a biblioteca do jogo para adaptar as tatuagens marcadas.|Новый снимок загружен для просмотра; библиотека не менялась. Обновите библиотеку игры, чтобы адаптировать отмеченные татуировки.
图层顺序已调整；列表上层覆盖下层。保存设计后保留。|Ordem das camadas alterada; as superiores cobrem as inferiores. Salve para manter.|Порядок слоёв изменён; верхние закрывают нижние. Сохраните дизайн, чтобы оставить изменения.
已取消选中。拖入图层放置，或点击已有纹身编辑。|Seleção cancelada. Arraste uma camada para posicionar ou clique numa tatuagem para editar.|Выбор снят. Перетащите слой для размещения или нажмите на татуировку для правки.
拖到模型表面，松开鼠标放置；拖到空白则取消。|Arraste ao modelo e solte para posicionar; solte no fundo para cancelar.|Перетащите на модель и отпустите для размещения; отпустите над фоном для отмены.
已取消放置|Posicionamento cancelado|Размещение отменено
这里没有模型表面，原位置保持不变。|Sem superfície do modelo aqui; posição original mantida.|Здесь нет поверхности модели; исходное положение сохранено.
请先从图层列表拖到模型放置，再切换UV映射。|Primeiro arraste a camada ao modelo; depois mude para projeção UV.|Сначала перетащите слой на модель, затем переключитесь на UV-проекцию.
此方向没有可见表面，请旋转视角或把图层重新拖到目标位置。|Nenhuma superfície visível nesta direção. Gire a vista ou arraste a camada ao destino.|В этом направлении нет видимой поверхности. Поверните вид или перетащите слой в нужное место.
已按圆柱实际弧长匹配图片比例；旋转归零可恢复水平图案。|Proporção ajustada ao arco do cilindro; redefina a rotação para nivelar a imagem.|Пропорции подогнаны по длине дуги цилиндра; сбросьте поворот, чтобы выровнять рисунок по горизонтали.
请先重新读取角色模型|Capture novamente o modelo do personagem primeiro|Сначала считайте модель персонажа заново
此设计的UV区域不在当前模型中|A região UV do design não existe no modelo atual|UV-область этого дизайна отсутствует в текущей модели
草稿已保存到左侧纹身库；放好图案后再保存，即可加入游戏。|Rascunho salvo na biblioteca. Posicione a imagem e salve novamente para incluir no jogo.|Черновик сохранён в библиотеке. Разместите рисунок и сохраните снова для включения в игру.
设计已保存：{0}。左侧可重新打开，更新游戏时才会构建模组。|Design salvo: {0}. Reabra à esquerda; o mod é gerado ao atualizar a biblioteca do jogo.|Дизайн сохранён: {0}. Его можно открыть слева; мод собирается при обновлении библиотеки игры.
分组已建立在本机：{0}。现在可以新建纹身。|Grupo criado localmente: {0}. Agora você pode criar uma tatuagem.|Группа создана локально: {0}. Теперь можно создать татуировку.
分组已建立在本机：{0}，当前设计已保存。|Grupo criado localmente: {0}; design atual salvo.|Группа создана локально: {0}; текущий дизайн сохранён.
空白纹身草稿已保存。带入图片后继续编辑，再点「保存设计」。|Rascunho vazio salvo. Importe imagens, edite e clique em Salvar design.|Пустой черновик сохранён. Добавьте изображения, внесите правки и нажмите «Сохранить дизайн».
还没有可加入游戏的设计。请先把图案放到模型上并保存。|Nenhum design pronto para o jogo. Posicione uma imagem no modelo e salve.|Нет дизайнов для включения в игру. Разместите рисунок на модели и сохраните.
关闭游戏后，自行在Vortex部署并重启游戏。|Feche o jogo, implante no Vortex e reinicie o jogo.|Закройте игру, выполните развёртывание в Vortex и запустите игру снова.
目标模型：{0}。{1}|Modelo de destino: {0}. {1}|Целевая модель: {0}. {1}
首次在Vortex安装：{0}|Primeira instalação no Vortex: {0}|Первая установка в Vortex: {0}
正在匹配 {0} / {1}：{2}|Adaptando {0} / {1}: {2}|Адаптация {0} / {1}: {2}
纹身库已按 {0} 生成；重新适配 {1} 套，由你自行部署。|Biblioteca gerada para {0}; {1} designs adaptados. Faça a implantação manualmente.|Библиотека собрана для {0}; адаптировано дизайнов: {1}. Выполните развёртывание вручную.
已导出可编辑设计：内嵌图片和全部图层参数；其他电脑可直接导入，并使用自己的角色快照。|Design editável exportado com imagens e todos os parâmetros. Importe em outro computador usando sua própria captura de personagem.|Редактируемый дизайн экспортирован с изображениями и всеми параметрами слоёв. Его можно импортировать на другом компьютере и использовать свой снимок персонажа.
独立模组已导出：{0}；适配 {1}。由你安装或分享。|Mod independente exportado: {0}; adaptado a {1}. Instale ou compartilhe.|Самостоятельный мод экспортирован: {0}; адаптирован к {1}. Установите его или поделитесь им.
浏览器未启用 WebGL，无法显示身体。请在浏览器设置中启用图形加速。|WebGL indisponível. Ative a aceleração gráfica nas configurações do navegador.|WebGL недоступен. Включите аппаратное ускорение графики в настройках браузера.
编辑器未能启动，请检查提示。|O editor não iniciou; confira a mensagem de erro.|Не удалось запустить редактор; проверьте сообщение об ошибке.
当前浏览器不支持此模型，请使用新版 Chrome。|Este navegador não suporta o modelo. Use uma versão recente do Chrome.|Браузер не поддерживает эту модель. Используйте новую версию Chrome.
需要 24 MB 以内的 PNG 图片|É necessária uma imagem PNG com menos de 24 MB|Требуется изображение PNG размером менее 24 МБ
带入图片，再从图层列表拖到模型表面放置。|Importe uma imagem e arraste sua camada ao modelo.|Добавьте изображение и перетащите его слой на поверхность модели.
示例已添加。请把左侧图层拖到模型表面放置。|Exemplo adicionado. Arraste a camada à esquerda para o modelo.|Образец добавлен. Перетащите слой слева на поверхность модели.
输出清晰度无效|Resolução de saída inválida|Недопустимое разрешение вывода
不是受支持的 RB 纹身设计文件|Arquivo de design de tatuagem não suportado|Неподдерживаемый файл дизайна татуировки
设计参数无效|Parâmetros do design inválidos|Недопустимые параметры дизайна
设计参数超出范围|Parâmetros do design fora do intervalo|Параметры дизайна вне допустимого диапазона
设计位置无效|Posição do design inválida|Недопустимое положение дизайна
设计图片无效|Imagem do design inválida|Недопустимое изображение дизайна
混合对象无效|Destino de mesclagem inválido|Недопустимый объект смешивания
图层混合模式无效|Modo de mesclagem inválido|Недопустимый режим наложения слоя
图层模糊数值无效|Valor de desfoque inválido|Недопустимое значение размытия слоя
设计文件内容无效|Conteúdo do arquivo de design inválido|Недопустимое содержимое файла дизайна
不支持此设计文件格式|Formato de design não suportado|Неподдерживаемый формат дизайна
不支持此图层顺序版本|Versão da ordem de camadas não suportada|Неподдерживаемая версия порядка слоёв
设计必须内嵌 PNG 图片，不能引用另一台电脑上的文件|O design deve incluir imagens PNG, sem links para arquivos de outro computador|Дизайн должен содержать встроенные PNG, а не ссылки на файлы другого компьютера
输出贴图时图形上下文已丢失，请刷新工作台后重试。|Contexto gráfico perdido ao exportar. Atualize o tatto studio e tente novamente.|При выводе текстуры потерян графический контекст. Обновите страницу редактора и повторите.
输出贴图时显存分配失败（OUT_OF_MEMORY）；可关闭其他工作台页面或游戏再试，或者选择 2K。|Falha na alocação de memória de vídeo (OUT_OF_MEMORY). Feche outras páginas ou o jogo e tente novamente, ou escolha 2K.|Не удалось выделить видеопамять (OUT_OF_MEMORY). Закройте другие страницы редактора или игру и повторите, либо выберите 2K.
输出贴图超过浏览器支持的纹理尺寸，请选 2K。|Textura excede o limite do navegador. Escolha 2K.|Размер текстуры превышает предел браузера. Выберите 2K.
模型资源详情|Detalhes dos recursos do modelo|Сведения о ресурсах модели
有 {0} 项资源未用于预览，可展开资源详情查看。|{0} recursos não usados na prévia. Expanda os detalhes para conferir.|Ресурсов, не использованных в просмотре: {0}. Разверните сведения для проверки.
{0}：资源冲突，未自动选择。来源：{1}|{0}: recursos em conflito; sem seleção automática. Origens: {1}|{0}: конфликт ресурсов, автоматический выбор не выполнен. Источники: {1}
{0}：没有可用的预览网格。|{0}: nenhuma malha disponível para prévia.|{0}: нет подходящей сетки для просмотра.
{0}：未找到已部署资源。|{0}: recurso implantado não encontrado.|{0}: установленный ресурс не найден.
未用于预览的组件：{0}|Componente não usado na prévia: {0}|Компонент не использован в просмотре: {0}
{0}：未读取到皮肤贴图，使用参考颜色。|{0}: textura de pele indisponível; usando cor de referência.|{0}: текстура кожи недоступна; используется эталонный цвет.
皮肤资源有多个覆盖来源：{0}|Várias substituições para recursos de pele: {0}|Несколько переопределений ресурсов кожи: {0}
皮肤资源未能读取：{0}|Não foi possível carregar o recurso de pele: {0}|Не удалось считать ресурс кожи: {0}
{0} 处资源已按游戏加载顺序选择。|{0} recursos selecionados pela ordem de carregamento do jogo.|Ресурсов выбрано по порядку загрузки игры: {0}.
部分皮肤资源未能读取。|Não foi possível carregar alguns recursos de pele.|Не удалось считать некоторые ресурсы кожи.
当前快照肤色校准|Calibração de pele desta captura|Калибровка кожи текущего снимка
明亮度|Brilho|Яркость
冷暖（左冷／右暖）|Temperatura (frio / quente)|Температура (холоднее / теплее)
饱和度|Saturação|Насыщенность
重置当前快照校准|Redefinir calibração desta captura|Сбросить калибровку этого снимка
仅影响预览，按快照分别记忆；不改变纹身输出。|Só prévia, salva por captura. A tatuagem exportada não muda.|Только просмотр, отдельно для каждого снимка. Экспорт татуировки не меняется.
已重置当前快照的预览肤色校准。|Calibração de pele redefinida para esta captura.|Калибровка кожи этого снимка сброшена.
预览渲染校准|Calibração da renderização de prévia|Калибровка рендеринга просмотра
适用于所有角色快照|Aplica-se a todas as capturas de personagem|Применяется ко всем снимкам персонажей
全局预览设置；保留各快照原有肤色，不改变纹身输出。|Configurações globais de prévia. Cada captura mantém sua cor de pele; a tatuagem exportada não muda.|Общие настройки просмотра. Каждый снимок сохраняет свой цвет кожи; экспорт татуировки не меняется.
重置渲染基准|Redefinir referência de renderização|Сбросить базовые настройки рендеринга
已重置全局预览渲染基准。|Referência global de renderização redefinida.|Общие базовые настройки рендеринга сброшены.
圆柱图案缩放|Escala da imagem cilíndrica|Масштаб рисунка на цилиндре
R 只缩放图案；半径和覆盖角度保持不变。|R redimensiona apenas a imagem; raio e ângulo permanecem iguais.|R изменяет только рисунок; радиус и угол охвата сохраняются.
正在读取角色快照…|Lendo captura do personagem…|Чтение снимка персонажа…
正在读取：{0}|Lendo: {0}|Чтение: {0}
角色读取完成|Personagem carregado|Персонаж загружен
角色读取失败|Falha ao carregar personagem|Не удалось загрузить персонажа
正在载入角色预览…|Carregando prévia do personagem…|Загрузка предпросмотра персонажа…
圆柱图案缩放参数无效|Escala da imagem cilíndrica inválida|Недопустимый масштаб рисунка на цилиндре
读取实际部署的资源索引…|Lendo índice dos recursos implantados…|Чтение индекса развёрнутых ресурсов…
批量提取 {0}|Extraindo {0}|Извлечение {0}
准备实际网格骨骼与变形：{0}|Preparando esqueleto e deformações: {0}|Подготовка скелета и деформаций: {0}
读取皮肤资源：{0}|Lendo recursos de pele: {0}|Чтение ресурсов кожи: {0}
转换皮肤颜色和细节贴图…|Convertendo texturas de cor e detalhes da pele…|Преобразование текстур цвета и деталей кожи…
隐藏图层|Ocultar camada|Скрыть слой
显示图层|Mostrar camada|Показать слой
隐藏图层 {0}|Ocultar camada {0}|Скрыть слой {0}
显示图层 {0}|Mostrar camada {0}|Показать слой {0}
背面剔除|Remover faces traseiras|Отсечение обратных граней
圆柱半径|Raio do cilindro|Радиус цилиндра
环绕角度|Ângulo de cobertura|Угол охвата
图层开关参数无效|Estado de camada inválido|Недопустимое состояние слоя
预览姿势|Pose de prévia|Поза предпросмотра
原始姿势|Pose original|Исходная поза
T Pose（试验）|Pose T (experimental)|T-поза (экспериментальная)
切换姿势不改变已有纹身。新放置的图层使用当前姿势；编辑已有图层时，回到其摆放姿势。|Mudar a pose preserva as tatuagens. Novas camadas usam a pose atual; editar uma camada restaura sua pose de posicionamento.|Смена позы сохраняет татуировки. Новые слои используют текущую позу; редактирование слоя возвращает позу его размещения.
正在准备 T Pose…|Preparando pose T…|Подготовка T-позы…
T Pose 已准备好|Pose T pronta|T-поза готова
已恢复原始姿势|Pose original restaurada|Исходная поза восстановлена
请先选择角色快照，再使用 T Pose|Selecione uma captura antes de usar a pose T|Перед использованием T-позы выберите снимок персонажа
T Pose 准备失败|Falha ao preparar a pose T|Не удалось подготовить T-позу
准备 T Pose：{0}|Preparando pose T: {0}|Подготовка T-позы: {0}
图层姿势参数无效|Pose de camada inválida|Недопустимая поза слоя
图案缩放|Escala do desenho|Масштаб рисунка
投射半径|Raio de projeção|Радиус проекции
垂直覆盖角度|Ângulo de cobertura vertical|Угол вертикального охвата
图案缩放参数无效|Escala do desenho inválida|Недопустимый масштаб рисунка
两种姿势均可放置和编辑纹身。切换姿势保留已有纹身；坐标轴随当前姿势显示。|Posicione e edite tatuagens em ambas as poses. A troca de pose preserva as tatuagens; os eixos seguem a pose exibida.|Размещайте и редактируйте татуировки в обеих позах. Смена позы сохраняет татуировки; оси следуют отображаемой позе.
投射器比例|Escala do projetor|Масштаб проектора
R 缩放整个投射器与参考线；这里仅调整内部图案。|R redimensiona o projetor e as guias; estes campos ajustam apenas a imagem interna.|R масштабирует проектор и направляющие вместе; эти поля меняют только рисунок внутри.
液化推拉|Dissolver: empurrar|Пластика: сдвиг
笔刷大小|Tamanho do pincel|Размер кисти
推拉强度|Intensidade|Сила сдвига
清除液化|Redefinir dissolução|Сбросить пластику
液化数据无效|Dados de dissolução inválidos|Недопустимые данные пластики
当前显卡不支持液化预览|Esta GPU não oferece prévia de dissolução|Этот GPU не поддерживает предпросмотр пластики
拖动模型表面的图案进行推拉；Alt＋左拖旋转视角，Ctrl＋Z 撤回整笔。|Arraste sobre o modelo para deformar a tatuagem. Alt + arrastar com o botão esquerdo gira a visão; Ctrl + Z desfaz um traço.|Тяните рисунок на модели. Alt + левая кнопка поворачивает вид; Ctrl + Z отменяет мазок.
液化推拉：图案上拖动推拉；空白处左拖旋转，右拖平移；Alt＋左拖也可旋转，Ctrl＋Z 撤回整笔。|Arraste a tatuagem para deformar. No espaço vazio, arraste com o botão esquerdo para girar; com o direito para mover a visão. Alt + esquerdo também gira; Ctrl + Z desfaz o traço.|Тяните рисунок для деформации. На пустом фоне левая кнопка вращает вид, правая перемещает. Alt + левая также вращает; Ctrl + Z отменяет мазок.
当前图层的液化已达上限，可撤回或清除液化后重试。|Esta camada atingiu o limite de dissolução. Desfaça ou redefina para continuar.|Достигнут лимит пластики слоя. Отмените изменения или сбросьте пластику.
液化推拉已更新；保存设计后保留，Ctrl＋Z 撤回整笔。|Dissolução atualizada. Salve o desenho para manter; Ctrl + Z desfaz o traço.|Пластика обновлена. Сохраните дизайн; Ctrl + Z отменяет мазок.
已清除当前图层的液化；Ctrl＋Z 可以恢复。|Dissolução redefinida nesta camada. Ctrl + Z restaura.|Пластика слоя сброшена. Ctrl + Z восстанавливает её.
液化推拉支持平面、圆柱、球形和曲面贴合；先选择已放置的可见图层。|Dissolver aceita projeções plana, cilíndrica, esférica e ajuste à superfície. Selecione uma camada visível e posicionada.|Пластика поддерживает плоскую, цилиндрическую, сферическую проекции и обтекание поверхности. Выберите размещённый видимый слой.
移动时贴合表面|Seguir a superfície ao mover|Следовать поверхности при перемещении
首次手动旋转后保留角度；可重新勾选表面贴合。|A rotação manual fixa o ângulo. Reative o acompanhamento para alinhar novamente.|Ручное вращение фиксирует угол. Снова включите следование поверхности для выравнивания.
仅调整皮肤预览；素材颜色和纹身输出不变。|Ajusta apenas a prévia da pele; cores das imagens e saída permanecem iguais.|Меняет только предпросмотр кожи; цвета изображений и результат татуировки не меняются.
W 移动 · 箭头单轴，方块沿 XY／YZ／XZ 平面，中心自由贴合|W Mover · setas: um eixo; quadrados: planos XY/YZ/XZ; centro: superfície|W Перемещение · стрелки: одна ось; квадраты: XY/YZ/XZ; центр: по поверхности
沿 XY 平面移动|Mover no plano XY|Перемещение в плоскости XY
沿 YZ 平面移动|Mover no plano YZ|Перемещение в плоскости YZ
沿 XZ 平面移动|Mover no plano XZ|Перемещение в плоскости XZ
`;
export const additionalTranslations=new Map(rows.trim().split('\n').map(line=>{
 const [source,...translations]=line.split('|');
 if(translations.length!==2||translations.some(value=>!value))throw new Error('Incomplete additional translation: '+source);
 return [source,translations];
}));
